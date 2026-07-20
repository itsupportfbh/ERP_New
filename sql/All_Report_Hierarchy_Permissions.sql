/*
  Adds parent/child report permission functions without overwriting existing flags.
  Safe to run on ERP_Template and tenant databases.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.OrganizationRole_Backup_AllReports_20260720', N'U') IS NULL
BEGIN
    SELECT *, SYSDATETIME() AS BackupTakenAt
    INTO dbo.OrganizationRole_Backup_AllReports_20260720
    FROM dbo.OrganizationRole;
END;

DECLARE @Catalog TABLE
(
    Seq int NOT NULL,
    ModuleId nvarchar(100) NOT NULL,
    ModuleTitle nvarchar(200) NOT NULL,
    FunctionId nvarchar(100) NOT NULL,
    FunctionTitle nvarchar(200) NOT NULL,
    PermissionSourceId nvarchar(100) NOT NULL
);

INSERT INTO @Catalog VALUES
-- Sales children inherit the Sales Report parent.
(1,N'sales',N'Sales',N'sales-report-by-item',N'Sales By Item',N'sales-report'),
(2,N'sales',N'Sales',N'sales-report-average-margin',N'Average Margin',N'sales-report'),
(3,N'sales',N'Sales',N'sales-report-deliveries',N'Deliveries',N'sales-report'),
(4,N'sales',N'Sales',N'sales-report-delivery-note',N'Delivery Note Summary',N'sales-report'),
-- Purchase parent inherits the existing Purchase Order permission; children inherit the same source on first migration.
(10,N'purchase',N'Purchase',N'purchase-report',N'Report',N'po-list'),
(11,N'purchase',N'Purchase',N'purchase-report-pr-register',N'PR Register',N'po-list'),
(12,N'purchase',N'Purchase',N'purchase-report-pr-pending',N'Pending PR Approvals',N'po-list'),
(13,N'purchase',N'Purchase',N'purchase-report-pr-by-dept',N'PR by Department',N'po-list'),
(14,N'purchase',N'Purchase',N'purchase-report-po-register',N'PO Register',N'po-list'),
(15,N'purchase',N'Purchase',N'purchase-report-po-open',N'Open PO / Outstanding Deliveries',N'po-list'),
(16,N'purchase',N'Purchase',N'purchase-report-po-by-supplier',N'PO Summary by Supplier',N'po-list'),
(17,N'purchase',N'Purchase',N'purchase-report-grn-register',N'GRN Register',N'po-list'),
(18,N'purchase',N'Purchase',N'purchase-report-grn-quality',N'Quality Check / Rejections',N'po-list'),
(19,N'purchase',N'Purchase',N'purchase-report-grn-variance',N'PO vs GRN Variance',N'po-list'),
(20,N'purchase',N'Purchase',N'purchase-report-pin-register',N'Supplier Invoice Register',N'po-list'),
(21,N'purchase',N'Purchase',N'purchase-report-pin-match',N'3-Way Match Exceptions',N'po-list'),
(22,N'purchase',N'Purchase',N'purchase-report-pin-payable',N'Outstanding Payables',N'po-list'),
(23,N'purchase',N'Purchase',N'purchase-report-dn-register',N'Debit Note Register',N'po-list'),
(24,N'purchase',N'Purchase',N'purchase-report-spend-trend',N'Monthly Spend Trend',N'po-list'),
(25,N'purchase',N'Purchase',N'purchase-report-scorecard',N'Supplier Scorecard',N'po-list'),
(26,N'purchase',N'Purchase',N'purchase-report-p2p-cycle',N'Procure-to-Pay Cycle',N'po-list'),
-- Financial children inherit the Financial Reports parent.
(30,N'financial',N'Financial',N'finance-report-profit-loss',N'Profit & Loss',N'reports'),
(31,N'financial',N'Financial',N'finance-report-balance-sheet',N'Balance Sheet',N'reports'),
(32,N'financial',N'Financial',N'finance-report-arap-aging',N'AR/AP Aging',N'reports'),
(33,N'financial',N'Financial',N'finance-report-gst-detail',N'GST Detail Report',N'reports'),
(34,N'financial',N'Financial',N'finance-report-collection-forecast',N'Collections Forecast',N'reports'),
(35,N'financial',N'Financial',N'finance-report-daybook',N'Daybook',N'reports');

;WITH Existing AS
(
    SELECT r.Id, rawRole.[key] SortOrder, j.ModuleId, j.ModuleTitle,
           j.FunctionId, j.FunctionTitle, j.Permissions
    FROM dbo.OrganizationRole r
    CROSS APPLY OPENJSON(r.RolesJSON) rawRole
    CROSS APPLY OPENJSON(rawRole.[value]) WITH
    (
        ModuleId nvarchar(100) '$.ModuleId', ModuleTitle nvarchar(200) '$.ModuleTitle',
        FunctionId nvarchar(100) '$.FunctionId', FunctionTitle nvarchar(200) '$.FunctionTitle',
        Permissions nvarchar(max) '$.Permissions' AS JSON
    ) j
),
Merged AS
(
    SELECT Id, SortOrder, ModuleId, ModuleTitle, FunctionId, FunctionTitle, Permissions FROM Existing
    UNION ALL
    SELECT role.Id, 2000 + catalog.Seq, catalog.ModuleId, catalog.ModuleTitle,
           catalog.FunctionId, catalog.FunctionTitle, sourcePermission.Permissions
    FROM dbo.OrganizationRole role
    CROSS JOIN @Catalog catalog
    CROSS APPLY
    (
        SELECT TOP (1) existingSource.Permissions
        FROM Existing existingSource
        WHERE existingSource.Id = role.Id
          AND existingSource.FunctionId = catalog.PermissionSourceId
    ) sourcePermission
    WHERE NOT EXISTS
    (
        SELECT 1 FROM Existing currentPermission
        WHERE currentPermission.Id = role.Id
          AND currentPermission.FunctionId = catalog.FunctionId
    )
),
Rebuilt AS
(
    SELECT role.Id,
      (SELECT item.ModuleId,item.ModuleTitle,item.FunctionId,item.FunctionTitle,
              JSON_QUERY(item.Permissions) Permissions
       FROM Merged item WHERE item.Id=role.Id ORDER BY item.SortOrder FOR JSON PATH) RolesJSON
    FROM dbo.OrganizationRole role
)
UPDATE role SET RolesJSON=rebuilt.RolesJSON, UpdatedDate=GETDATE()
FROM dbo.OrganizationRole role JOIN Rebuilt rebuilt ON rebuilt.Id=role.Id;

IF EXISTS
(
    SELECT 1 FROM dbo.OrganizationRole role CROSS JOIN @Catalog catalog
    WHERE NOT EXISTS
    (
        SELECT 1 FROM OPENJSON(role.RolesJSON)
        WITH (FunctionId nvarchar(100) '$.FunctionId') saved
        WHERE saved.FunctionId=catalog.FunctionId
    )
) THROW 51002, 'All-report permission hierarchy validation failed.', 1;

COMMIT TRANSACTION;

SELECT role.Id,role.UserId,COUNT(*) ReportPermissionCount,MIN(ISJSON(role.RolesJSON)) IsValidJson
FROM dbo.OrganizationRole role
CROSS APPLY OPENJSON(role.RolesJSON) WITH(FunctionId nvarchar(100) '$.FunctionId') saved
WHERE saved.FunctionId LIKE N'%report%'
GROUP BY role.Id,role.UserId;
