/*
  Synchronize ERP_Template.dbo.OrganizationRole.RolesJSON with the permission
  catalog used by the Angular user-access screen.

  - Preserves existing permission values.
  - Adds the missing Submit and Export flags (enabled for the template role).
  - Adds functions that were introduced after the original template JSON.
  - Replaces obsolete Inventory IDs with the IDs used by the application.
  - Is safe to run repeatedly.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @AllPermissions nvarchar(max) = N'{
  "View":true,"Create":true,"Edit":true,"Delete":true,"Submit":true,
  "Approve":true,"Reject":true,"Cancel":true,"Export":true,"Print":true,"Post":true
}';

;WITH ExistingFunctions AS
(
    SELECT
        r.Id,
        rawRole.[key] AS SortOrder,
        j.ModuleId,
        j.ModuleTitle,
        CASE WHEN j.FunctionId = N'stock-history'
             THEN N'list-stock-history' ELSE j.FunctionId END AS FunctionId,
        j.FunctionTitle,
        JSON_MODIFY(
            JSON_MODIFY(j.Permissions, '$.Submit', CAST(1 AS bit)),
            '$.Export', CAST(1 AS bit)
        ) AS Permissions
    FROM dbo.OrganizationRole AS r
    CROSS APPLY OPENJSON(r.RolesJSON) AS rawRole
    CROSS APPLY OPENJSON(rawRole.[value])
    WITH
    (
        ModuleId nvarchar(100) '$.ModuleId',
        ModuleTitle nvarchar(200) '$.ModuleTitle',
        FunctionId nvarchar(100) '$.FunctionId',
        FunctionTitle nvarchar(200) '$.FunctionTitle',
        Permissions nvarchar(max) '$.Permissions' AS JSON
    ) AS j
    WHERE j.FunctionId <> N'inv-internal'
),
MissingFunctions AS
(
    SELECT *
    FROM (VALUES
        (N'general',  N'General',   N'home',                        N'Dashboard'),
        (N'master',   N'Master',    N'department-menu-access',      N'Department Menu Access'),
        (N'master',   N'Master',    N'exchangerate',                N'Exchange Rate'),
        (N'purchase', N'Purchase',  N'supplier-scorecard',          N'Supplier Scorecard'),
        (N'inventory',N'Inventory', N'stock-overview',              N'Stock Overview'),
        (N'inventory',N'Inventory', N'stock-transfer',              N'Stock Transfer'),
        (N'inventory',N'Inventory', N'stock-adjustment',            N'Stock Adjustment'),
        (N'inventory',N'Inventory', N'mr-list',                     N'Material Request'),
        (N'inventory',N'Inventory', N'list-stock-transfer-receipt', N'Stock Transfer Request'),
        (N'financial',N'Financial', N'finance-dashboard',           N'Dashboard'),
        (N'financial',N'Financial', N'year-end',                    N'Year End Close')
       ,(N'sales',    N'Sales',     N'sales-report-by-item',        N'Sales By Item')
       ,(N'sales',    N'Sales',     N'sales-report-average-margin', N'Average Margin')
       ,(N'sales',    N'Sales',     N'sales-report-deliveries',     N'Deliveries')
       ,(N'sales',    N'Sales',     N'sales-report-delivery-note',  N'Delivery Note Summary')
       -- Purchase reports. `purchase-report` gates the menu entry and the
       -- route-level button directive; the rest gate one report card each,
       -- mirroring how the sales reports are catalogued above.
       ,(N'purchase', N'Purchase',  N'purchase-report',                   N'Purchase Reports')
       ,(N'purchase', N'Purchase',  N'purchase-report-pr-register',       N'PR Register')
       ,(N'purchase', N'Purchase',  N'purchase-report-pr-pending',        N'Pending PR Approvals')
       ,(N'purchase', N'Purchase',  N'purchase-report-pr-by-dept',        N'PR by Department')
       ,(N'purchase', N'Purchase',  N'purchase-report-po-register',       N'PO Register')
       ,(N'purchase', N'Purchase',  N'purchase-report-po-open',           N'Open PO / Outstanding Deliveries')
       ,(N'purchase', N'Purchase',  N'purchase-report-po-by-supplier',    N'PO Summary by Supplier')
       ,(N'purchase', N'Purchase',  N'purchase-report-grn-register',      N'GRN Register')
       ,(N'purchase', N'Purchase',  N'purchase-report-grn-quality',       N'Quality Check / Rejections')
       ,(N'purchase', N'Purchase',  N'purchase-report-grn-variance',      N'PO vs GRN Variance')
       ,(N'purchase', N'Purchase',  N'purchase-report-pin-register',      N'Supplier Invoice Register')
       ,(N'purchase', N'Purchase',  N'purchase-report-pin-match',         N'3-Way Match Exceptions')
       ,(N'purchase', N'Purchase',  N'purchase-report-pin-payable',       N'Outstanding Payables')
       ,(N'purchase', N'Purchase',  N'purchase-report-dn-register',       N'Debit Note Register')
       ,(N'purchase', N'Purchase',  N'purchase-report-spend-trend',       N'Monthly Spend Trend')
       ,(N'purchase', N'Purchase',  N'purchase-report-scorecard',         N'Supplier Scorecard Report')
       ,(N'purchase', N'Purchase',  N'purchase-report-p2p-cycle',         N'Procure-to-Pay Cycle')
    ) AS v(ModuleId, ModuleTitle, FunctionId, FunctionTitle)
),
MergedFunctions AS
(
    SELECT e.Id, e.SortOrder, e.ModuleId, e.ModuleTitle,
           e.FunctionId, e.FunctionTitle, e.Permissions
    FROM ExistingFunctions AS e

    UNION ALL

    SELECT r.Id, 1000 + ROW_NUMBER() OVER (ORDER BY m.ModuleId, m.FunctionId),
           m.ModuleId, m.ModuleTitle, m.FunctionId, m.FunctionTitle,
           @AllPermissions
    FROM dbo.OrganizationRole AS r
    CROSS JOIN MissingFunctions AS m
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM ExistingFunctions AS e
        WHERE e.Id = r.Id AND e.FunctionId = m.FunctionId
    )
),
RebuiltRoles AS
(
    SELECT
        role.Id,
        (
            SELECT
                f.ModuleId,
                f.ModuleTitle,
                f.FunctionId,
                f.FunctionTitle,
                JSON_QUERY(f.Permissions) AS Permissions
            FROM MergedFunctions AS f
            WHERE f.Id = role.Id
            ORDER BY f.SortOrder
            FOR JSON PATH
        ) AS RolesJSON
    FROM dbo.OrganizationRole AS role
)
UPDATE role
SET role.RolesJSON = rebuilt.RolesJSON,
    role.UpdatedDate = GETDATE()
FROM dbo.OrganizationRole AS role
INNER JOIN RebuiltRoles AS rebuilt ON rebuilt.Id = role.Id;

IF EXISTS
(
    SELECT 1
    FROM dbo.OrganizationRole AS r
    CROSS APPLY OPENJSON(r.RolesJSON)
    WITH
    (
        FunctionId nvarchar(100) '$.FunctionId',
        Permissions nvarchar(max) '$.Permissions' AS JSON
    ) AS j
    WHERE j.FunctionId IS NULL
       OR JSON_VALUE(j.Permissions, '$.View') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Create') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Edit') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Delete') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Submit') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Approve') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Reject') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Cancel') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Export') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Print') IS NULL
       OR JSON_VALUE(j.Permissions, '$.Post') IS NULL
)
    THROW 51000, 'OrganizationRole permission migration validation failed.', 1;

COMMIT TRANSACTION;

SELECT r.Id, COUNT(*) AS FunctionCount, MIN(ISJSON(r.RolesJSON)) AS IsValidJson
FROM dbo.OrganizationRole AS r
CROSS APPLY OPENJSON(r.RolesJSON) AS j
GROUP BY r.Id;
