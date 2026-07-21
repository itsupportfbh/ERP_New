/* =====================================================================
   DB_CHANGES.sql - runnable migrations, NEWEST BLOCK AT THE TOP.

   Run each block once per tenant database (ERP_Template, ERP_CSPL, ...),
   never against ERP_Master. Every block is idempotent and safe to re-run.
   Schema definitions are also folded into
   FinanaceAPI/FinanceApi/SqlScripts/ERP_Script.sql so that newly
   provisioned organisations get them automatically.
   ===================================================================== */


/* =====================================================================
   2026-07-20  Fix sp_RebuildWarehouseStockSummary - stamp CompanyId
   ---------------------------------------------------------------------
   The proc (called from the GRN posting path) created warehouse summary
   rows in dbo.ItemWarehouseStock without a CompanyId. Now that the
   inventory reads filter on CompanyId those rows would be invisible.
   The summary INSERT now derives CompanyId from the warehouse the row
   belongs to. CREATE OR ALTER, safe to re-run.

   Backfill for any summary rows already created without a company:
   ===================================================================== */

UPDATE s
SET s.CompanyId = w.CompanyId
FROM dbo.ItemWarehouseStock s
INNER JOIN dbo.Warehouse w ON w.Id = s.WarehouseId
WHERE s.BinId IS NULL
  AND ISNULL(s.CompanyId,0) = 0
  AND ISNULL(w.CompanyId,0) <> 0;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_RebuildWarehouseStockSummary]
    @WarehouseId INT = NULL,
  @CompanyId INT = 0

AS
BEGIN
    SET NOCOUNT ON;
 
    /* =========================================================
       1) Ensure summary rows exist for all physical/reservation items
       ========================================================= */
    ;WITH AllItems AS
    (
        SELECT DISTINCT
            s.ItemId,
            s.WarehouseId
        FROM dbo.ItemWarehouseStock s
        WHERE s.BinId IS NOT NULL
          AND s.WarehouseId = ISNULL(@WarehouseId, s.WarehouseId)
 
        UNION
 
        SELECT DISTINCT
            r.IngredientItemId AS ItemId,
            r.WarehouseId
        FROM dbo.ProductionPlanReservation r
        WHERE r.WarehouseId = ISNULL(@WarehouseId, r.WarehouseId)
    )
    INSERT INTO dbo.ItemWarehouseStock
    (
        ItemId,
        WarehouseId,
        BinId,
        StrategyId,
        OnHand,
        Reserved,
        MinQty,
        MaxQty,
        ReorderQty,
        LeadTimeDays,
        BatchFlag,
        SerialFlag,
        Available,
        IsTransfered,
        IsApproved,
        StockIssueID,
        IsFullTransfer,
        IsPartialTransfer,
        ApprovedBy,
        CompanyId
    )
    SELECT
        a.ItemId,
        a.WarehouseId,
        NULL,
        NULL,
        CAST(0 AS DECIMAL(18,4)),
        CAST(0 AS DECIMAL(18,4)),
        NULL,
        NULL,
        NULL,
        NULL,
        CAST(0 AS BIT),
        CAST(0 AS BIT),
        CAST(0 AS DECIMAL(18,4)),
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        -- A warehouse belongs to exactly one company, so the summary row must
        -- carry that company. Without it these rows land with CompanyId NULL
        -- and disappear from every company-filtered read.
        w.CompanyId
    FROM AllItems a
    INNER JOIN dbo.Warehouse w ON w.Id = a.WarehouseId
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.ItemWarehouseStock s
        WHERE s.ItemId = a.ItemId
          AND s.WarehouseId = a.WarehouseId
          AND s.BinId IS NULL
          AND s.StrategyId IS NULL
    );
 
    /* =========================================================
       2) Aggregate physical bin stock
       ========================================================= */
    ;WITH PhysicalAgg AS
    (
        SELECT
            s.ItemId,
            s.WarehouseId,
            CAST(SUM(ISNULL(s.OnHand, 0)) AS DECIMAL(18,4)) AS OnHandQty
        FROM dbo.ItemWarehouseStock s
        WHERE s.BinId IS NOT NULL
          AND s.WarehouseId = ISNULL(@WarehouseId, s.WarehouseId)
        GROUP BY s.ItemId, s.WarehouseId
    ),
    ReserveAgg AS
    (
        SELECT
            r.IngredientItemId AS ItemId,
            r.WarehouseId,
            CAST(SUM(ISNULL(r.ReservedQty, 0)) AS DECIMAL(18,4)) AS ReservedQty
        FROM dbo.ProductionPlanReservation r
        WHERE r.WarehouseId = ISNULL(@WarehouseId, r.WarehouseId)
        GROUP BY r.IngredientItemId, r.WarehouseId
    ),
    FinalAgg AS
    (
        SELECT
            x.ItemId,
            x.WarehouseId,
            CAST(ISNULL(p.OnHandQty, 0) AS DECIMAL(18,4)) AS OnHandQty,
            CAST(ISNULL(r.ReservedQty, 0) AS DECIMAL(18,4)) AS ReservedQty
        FROM
        (
            SELECT DISTINCT ItemId, WarehouseId
            FROM dbo.ItemWarehouseStock
            WHERE WarehouseId = ISNULL(@WarehouseId, WarehouseId)
        ) x
        LEFT JOIN PhysicalAgg p
            ON p.ItemId = x.ItemId
           AND p.WarehouseId = x.WarehouseId
        LEFT JOIN ReserveAgg r
            ON r.ItemId = x.ItemId
           AND r.WarehouseId = x.WarehouseId
    )
    UPDATE s
       SET s.OnHand = f.OnHandQty,
           s.Reserved = f.ReservedQty,
           s.Available =
                CASE
                    WHEN f.OnHandQty - f.ReservedQty < 0 THEN 0
                    ELSE CAST(f.OnHandQty - f.ReservedQty AS DECIMAL(18,4))
                END
    FROM dbo.ItemWarehouseStock s
    INNER JOIN FinalAgg f
        ON f.ItemId = s.ItemId
       AND f.WarehouseId = s.WarehouseId
    WHERE s.BinId IS NULL
      AND s.StrategyId IS NULL;
END
GO



/* =====================================================================
   2026-07-20  Inventory module tenant scoping - PRE-DEPLOY CHECK
   ---------------------------------------------------------------------
   The inventory repositories now filter every read and write on CompanyId.
   Several edit paths used to INSERT line rows without a CompanyId, and a
   few queries had no tenant predicate at all, so rows may exist that carry
   no company. Those rows become invisible the moment the new API is
   deployed.

   This block is READ ONLY - it only reports. Run it against every company
   database BEFORE deploying. Expect no rows returned.

   Checked on 2026-07-20: ERP_CSPL and ERP_Template both clean.
   ===================================================================== */

SET NOCOUNT ON;

SELECT TableName, Orphans, TotalRows
FROM (
    SELECT 'Item'                      AS TableName, SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END) AS Orphans, COUNT(*) AS TotalRows FROM dbo.Item
    UNION ALL SELECT 'ItemMaster',                   SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.ItemMaster
    UNION ALL SELECT 'ItemPrice',                    SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.ItemPrice
    UNION ALL SELECT 'ItemWarehouseStock',           SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.ItemWarehouseStock
    UNION ALL SELECT 'ItemBom',                      SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.ItemBom
    UNION ALL SELECT 'Stock',                        SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.Stock
    UNION ALL SELECT 'StockTake',                    SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockTake
    UNION ALL SELECT 'StockTakeLines',               SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockTakeLines
    UNION ALL SELECT 'StockReorder',                 SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockReorder
    UNION ALL SELECT 'StockReorderLines',            SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockReorderLines
    UNION ALL SELECT 'StockReorderLineSuppliers',    SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockReorderLineSuppliers
    UNION ALL SELECT 'MaterialRequisition',          SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.MaterialRequisition
    UNION ALL SELECT 'MaterialRequisitionLine',      SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.MaterialRequisitionLine
    UNION ALL SELECT 'StockTakeInventoryAdjustment', SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.StockTakeInventoryAdjustment
    UNION ALL SELECT 'Warehouse',                    SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.Warehouse
    UNION ALL SELECT 'BIN',                          SUM(CASE WHEN ISNULL(CompanyId,0)=0 THEN 1 ELSE 0 END), COUNT(*) FROM dbo.BIN
) x
WHERE Orphans > 0
ORDER BY Orphans DESC;

IF @@ROWCOUNT = 0
    PRINT 'OK - every inventory row carries a CompanyId. Nothing will disappear after deploy.';
ELSE
    PRINT 'ACTION NEEDED - the rows listed above will vanish from the UI after deploy.';
GO

/* ---------------------------------------------------------------------
   BACKFILL - run ONLY if the check above returned rows, and only for the
   tables it named. Each statement takes the company from the parent row,
   so it cannot guess: a child row whose parent is also orphaned stays
   orphaned and needs to be looked at by hand.

   Review before running. Kept commented out deliberately.
   --------------------------------------------------------------------- */

-- UPDATE l SET l.CompanyId = h.CompanyId
-- FROM dbo.StockTakeLines l
-- INNER JOIN dbo.StockTake h ON h.Id = l.StockTakeId
-- WHERE ISNULL(l.CompanyId,0) = 0 AND ISNULL(h.CompanyId,0) <> 0;

-- UPDATE l SET l.CompanyId = h.CompanyId
-- FROM dbo.StockReorderLines l
-- INNER JOIN dbo.StockReorder h ON h.Id = l.StockReorderId
-- WHERE ISNULL(l.CompanyId,0) = 0 AND ISNULL(h.CompanyId,0) <> 0;

-- UPDATE s SET s.CompanyId = l.CompanyId
-- FROM dbo.StockReorderLineSuppliers s
-- INNER JOIN dbo.StockReorderLines l ON l.Id = s.StockReorderLineId
-- WHERE ISNULL(s.CompanyId,0) = 0 AND ISNULL(l.CompanyId,0) <> 0;

-- UPDATE l SET l.CompanyId = h.CompanyId
-- FROM dbo.MaterialRequisitionLine l
-- INNER JOIN dbo.MaterialRequisition h ON h.Id = l.MaterialReqId
-- WHERE ISNULL(l.CompanyId,0) = 0 AND ISNULL(h.CompanyId,0) <> 0;

-- UPDATE im SET im.CompanyId = i.CompanyId
-- FROM dbo.ItemMaster im
-- INNER JOIN dbo.Item i ON i.Id = im.ItemId
-- WHERE ISNULL(im.CompanyId,0) = 0 AND ISNULL(i.CompanyId,0) <> 0;

-- UPDATE p SET p.CompanyId = im.CompanyId
-- FROM dbo.ItemPrice p
-- INNER JOIN dbo.ItemMaster im ON im.Id = p.ItemId
-- WHERE ISNULL(p.CompanyId,0) = 0 AND ISNULL(im.CompanyId,0) <> 0;

-- UPDATE s SET s.CompanyId = im.CompanyId
-- FROM dbo.ItemWarehouseStock s
-- INNER JOIN dbo.ItemMaster im ON im.Id = s.ItemId
-- WHERE ISNULL(s.CompanyId,0) = 0 AND ISNULL(im.CompanyId,0) <> 0;

-- UPDATE b SET b.CompanyId = im.CompanyId
-- FROM dbo.ItemBom b
-- INNER JOIN dbo.ItemMaster im ON im.Id = b.ItemId
-- WHERE ISNULL(b.CompanyId,0) = 0 AND ISNULL(im.CompanyId,0) <> 0;
GO


/* =====================================================================
   2026-07-20  Inventory reports hub - menu permissions
   ---------------------------------------------------------------------
   No schema change is required. dbo.ReportSavedView and dbo.ReportRoleAccess
   already exist and are keyed by report key string, so the eight new
   INV_* keys need no new rows - the '*' rules seeded for the administrative
   roles in the block below already cover them.

   What IS required is the permission catalogue. dbo.OrganizationRole.RolesJSON
   is a stored snapshot of the function list, so roles saved before this
   release simply have no entry for the new inventory report functions, and a
   missing FunctionId reads as View = false. That hides every card on the hub.

   This block appends the thirteen missing entries to each OrganizationRole
   (nine inventory reports, plus the four finance reports added to the finance
   hub in the same release), granting View / Export / Print only where that
   role can already see the sibling function it mirrors - Item Master
   ('im-list') for inventory, Financial > Reports ('reports') for finance.
   Nothing is widened. Roles with no such access get the entries with
   everything false, so they show up in Roles & Permissions as unticked boxes
   an administrator can grant.

   Re-running is safe: an entry that is already present is skipped, and
   permissions an administrator has since changed by hand are left alone.
   ===================================================================== */

SET NOCOUNT ON;

DECLARE @Fns TABLE (Seq INT IDENTITY(1,1) PRIMARY KEY, ModuleId NVARCHAR(60), ModuleTitle NVARCHAR(120),
                    FunctionId NVARCHAR(100), FunctionTitle NVARCHAR(200), MirrorOf NVARCHAR(100));

/* The four finance cards below were added to the reports hub in the same
   release. They are gated the same way, and mirror the role's existing
   Financial > Reports access rather than the Item Master. */
INSERT INTO @Fns (ModuleId, ModuleTitle, FunctionId, FunctionTitle, MirrorOf) VALUES
    ('finance', 'Financial', 'finance-report-trial-balance', 'Trial Balance',     'reports'),
    ('finance', 'Financial', 'finance-report-ledger',        'Account Ledger',    'reports'),
    ('finance', 'Financial', 'finance-report-receipts',      'Receipts Register', 'reports'),
    ('finance', 'Financial', 'finance-report-payments',      'Payments Register', 'reports');

INSERT INTO @Fns (ModuleId, ModuleTitle, MirrorOf, FunctionId, FunctionTitle)
SELECT 'inventory', 'Inventory', 'im-list', FunctionId, FunctionTitle FROM (VALUES
    ('inventory-report',                'Report'),
    ('inventory-report-stock-summary',  'Stock Summary'),
    ('inventory-report-valuation',      'Valuation by Category'),
    ('inventory-report-movement',       'Stock Movement'),
    ('inventory-report-adjustments',    'Stock Adjustments'),
    ('inventory-report-transfers',      'Transfers & Requisitions'),
    ('inventory-report-variance',       'Stock Take Variance'),
    ('inventory-report-reorder',        'Reorder / Low Stock'),
    ('inventory-report-cogs',           'COGS / Consumption')
) AS f (FunctionId, FunctionTitle);

DECLARE @RoleId INT, @Json NVARCHAR(MAX), @Grant BIT, @GrantTxt NVARCHAR(10),
        @Seq INT, @MaxSeq INT, @FnId NVARCHAR(100), @FnTitle NVARCHAR(200),
        @ModId NVARCHAR(60), @ModTitle NVARCHAR(120), @Mirror NVARCHAR(100),
        @Entry NVARCHAR(MAX), @Added INT = 0, @RolesTouched INT = 0;

SELECT @MaxSeq = MAX(Seq) FROM @Fns;

DECLARE role_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT Id, RolesJSON FROM dbo.OrganizationRole
    WHERE RolesJSON IS NOT NULL AND ISJSON(RolesJSON) = 1;

OPEN role_cur;
FETCH NEXT FROM role_cur INTO @RoleId, @Json;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Seq = 1;

    WHILE @Seq <= @MaxSeq
    BEGIN
        SELECT @FnId = FunctionId, @FnTitle = FunctionTitle,
               @ModId = ModuleId, @ModTitle = ModuleTitle, @Mirror = MirrorOf
        FROM @Fns WHERE Seq = @Seq;

        /* Mirror whatever view access this role already has to the sibling
           function named by MirrorOf, so nothing is widened. */
        SELECT @Grant = CASE WHEN EXISTS (
            SELECT 1 FROM OPENJSON(@Json)
            WHERE JSON_VALUE(value, '$.FunctionId') = @Mirror
              AND JSON_VALUE(value, '$.Permissions.View') = 'true'
        ) THEN 1 ELSE 0 END;

        SET @GrantTxt = CASE WHEN @Grant = 1 THEN 'true' ELSE 'false' END;

        IF NOT EXISTS (SELECT 1 FROM OPENJSON(@Json)
                       WHERE JSON_VALUE(value, '$.FunctionId') = @FnId)
        BEGIN
            /* Reports are read-only: only View / Export / Print are ever granted. */
            SET @Entry =
                '{"ModuleId":"' + @ModId + '","ModuleTitle":"' + @ModTitle + '",' +
                '"FunctionId":"' + @FnId + '","FunctionTitle":"' + REPLACE(@FnTitle, '"', '\"') + '",' +
                '"Permissions":{"View":' + @GrantTxt + ',"Create":false,"Edit":false,"Delete":false,' +
                '"Submit":false,"Approve":false,"Reject":false,"Cancel":false,' +
                '"Export":' + @GrantTxt + ',"Print":' + @GrantTxt + ',"Post":false}}';

            SET @Json = JSON_MODIFY(@Json, 'append $', JSON_QUERY(@Entry));
            SET @Added += 1;
        END

        SET @Seq += 1;
    END

    UPDATE dbo.OrganizationRole
    SET RolesJSON   = @Json,
        UpdatedDate = GETDATE()
    WHERE Id = @RoleId;

    SET @RolesTouched += 1;
    FETCH NEXT FROM role_cur INTO @RoleId, @Json;
END

CLOSE role_cur;
DEALLOCATE role_cur;

PRINT CONCAT('Inventory report permissions: ', @Added, ' entries added across ', @RolesTouched, ' OrganizationRole row(s).');
GO

/* Verify - every OrganizationRole should now list 9 inventory report
   functions and all 10 finance report functions. */
SELECT o.Id AS OrganizationRoleId,
       o.UserId,
       InventoryReportFns = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'inventory-report%'),
       InventoryGranted  = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'inventory-report%'
                               AND JSON_VALUE(value, '$.Permissions.View') = 'true'),
       FinanceReportFns  = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'finance-report%'),
       FinanceGranted    = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'finance-report%'
                               AND JSON_VALUE(value, '$.Permissions.View') = 'true')
FROM dbo.OrganizationRole o
WHERE o.RolesJSON IS NOT NULL AND ISJSON(o.RolesJSON) = 1
ORDER BY o.Id;
GO


/* =====================================================================
   2026-07-20  Dynamic sales reports: saved views + report role access
   ---------------------------------------------------------------------
   dbo.ReportSavedView   - per-user saved column/filter presets
   dbo.ReportRoleAccess  - field/row level security for the sales reports

   Nothing is dropped or updated; only missing objects/rows are created.
   ===================================================================== */

IF OBJECT_ID('dbo.ReportSavedView', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReportSavedView
    (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ReportKey NVARCHAR(80) NOT NULL,
        Name NVARCHAR(120) NOT NULL,
        ConfigJson NVARCHAR(MAX) NOT NULL,
        UserId INT NOT NULL,
        CompanyId INT NOT NULL CONSTRAINT DF_ReportSavedView_CompanyId DEFAULT(0),
        IsActive BIT NOT NULL CONSTRAINT DF_ReportSavedView_IsActive DEFAULT(1),
        CreatedDate DATETIME2 NULL,
        UpdatedDate DATETIME2 NULL
    );

    CREATE UNIQUE INDEX UX_ReportSavedView_User_Report_Name
        ON dbo.ReportSavedView (UserId, CompanyId, ReportKey, Name);

    PRINT 'Created dbo.ReportSavedView';
END
ELSE
    PRINT 'dbo.ReportSavedView already exists - skipped';
GO

/* Access is DENY BY DEFAULT: a role sees cost / margin columns only when a
   row here grants it. The seed covers administrative roles so applying this
   never locks an admin out.

   ReportKey '*'            -> every report
   CanViewSensitive       1 -> may see cost, margin value, margin %
   RestrictToUserLocation 1 -> rows limited to dbo.[User].LocationId        */
IF OBJECT_ID('dbo.ReportRoleAccess', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReportRoleAccess
    (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        RoleName NVARCHAR(100) NOT NULL,
        ReportKey NVARCHAR(80) NOT NULL,
        CanViewSensitive BIT NOT NULL CONSTRAINT DF_ReportRoleAccess_Sensitive DEFAULT(0),
        RestrictToUserLocation BIT NOT NULL CONSTRAINT DF_ReportRoleAccess_Restrict DEFAULT(0),
        IsActive BIT NOT NULL CONSTRAINT DF_ReportRoleAccess_IsActive DEFAULT(1)
    );

    CREATE UNIQUE INDEX UX_ReportRoleAccess_Role_Report
        ON dbo.ReportRoleAccess (RoleName, ReportKey);

    PRINT 'Created dbo.ReportRoleAccess';
END
ELSE
    PRINT 'dbo.ReportRoleAccess already exists - skipped';
GO

MERGE dbo.ReportRoleAccess AS target
USING (VALUES
    ('Super Admin', '*', 1, 0),
    ('SUPER_ADMIN', '*', 1, 0),
    ('Owner',       '*', 1, 0),
    ('ORG_OWNER',   '*', 1, 0),
    ('Admin',       '*', 1, 0)
) AS source (RoleName, ReportKey, CanViewSensitive, RestrictToUserLocation)
    ON  target.RoleName  = source.RoleName
    AND target.ReportKey = source.ReportKey
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleName, ReportKey, CanViewSensitive, RestrictToUserLocation)
    VALUES (source.RoleName, source.ReportKey, source.CanViewSensitive, source.RestrictToUserLocation);
GO

/* Which roles still have no rule? Those users get no cost / margin columns. */
SELECT r.Name AS RoleName,
       UserCnt = (SELECT COUNT(*) FROM dbo.UserRoles ur
                  WHERE ur.RoleId = r.Id AND ISNULL(ur.IsActive, 1) = 1),
       HasReportRule = CASE WHEN EXISTS (
                            SELECT 1 FROM dbo.ReportRoleAccess ra
                            WHERE ra.RoleName = r.Name AND ra.IsActive = 1)
                       THEN 'yes' ELSE 'no - denied by default' END
FROM dbo.Roles r
WHERE ISNULL(r.IsActive, 1) = 1
ORDER BY r.Name;
GO

/* OPTIONAL - grant a role after reviewing the list above.
   Full visibility, all branches: */
-- INSERT INTO dbo.ReportRoleAccess (RoleName, ReportKey, CanViewSensitive, RestrictToUserLocation)
-- VALUES ('Sales Manager', '*', 1, 0);

/* No cost / margin, own branch only. Check the LocationId query below first -
   users whose LocationId does not resolve keep seeing every branch. */
-- INSERT INTO dbo.ReportRoleAccess (RoleName, ReportKey, CanViewSensitive, RestrictToUserLocation)
-- VALUES ('Sales Executive', '*', 0, 1);

-- SELECT u.Id, u.Username, u.LocationId
-- FROM dbo.[User] u
-- LEFT JOIN dbo.Location l ON l.Id = u.LocationId
-- WHERE ISNULL(u.IsActive, 1) = 1 AND l.Id IS NULL;
