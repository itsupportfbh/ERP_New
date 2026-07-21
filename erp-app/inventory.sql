/* =====================================================================
   inventory.sql
   Inventory module database changes.

   Run against each COMPANY database (ERP_CSPL, ...). Never ERP_Master.
   Every section is idempotent and safe to re-run.

   IMPORTANT - what is NOT here, and why:
   The inventory module was tightened so every read and write is scoped to a
   company. That was done entirely in the API's SQL (C#); it added no tables
   and no columns. The CompanyId columns it filters on already existed on
   Item, ItemMaster, ItemPrice, ItemWarehouseStock, Stock, StockTake,
   StockTakeLines, StockReorder (+Lines/LineSuppliers), MaterialRequisition
   (+Line), Warehouse and BIN. So there is no ALTER TABLE to run - deploying
   the API is enough for that part.

   What this file does contain:
     1. sp_RebuildWarehouseStockSummary - stamp CompanyId on summary rows
     2. Report tables the inventory reports need (create only if missing)
     3. Inventory report menu permissions (RolesJSON)
     4. Health checks - run these and read the output
     5. Optional repairs for rows damaged by the pre-fix transfer bugs
   ===================================================================== */

SET NOCOUNT ON;
GO


/* =====================================================================
   1. sp_RebuildWarehouseStockSummary
   ---------------------------------------------------------------------
   Called from the GRN posting path. It created warehouse summary rows in
   dbo.ItemWarehouseStock without a CompanyId; now that inventory reads are
   company-filtered those rows would be invisible. The summary INSERT now
   takes CompanyId from the warehouse the row belongs to.
   ===================================================================== */

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

/* Backfill any summary rows already created without a company. */
UPDATE s
SET s.CompanyId = w.CompanyId
FROM dbo.ItemWarehouseStock s
INNER JOIN dbo.Warehouse w ON w.Id = s.WarehouseId
WHERE s.BinId IS NULL
  AND ISNULL(s.CompanyId, 0) = 0
  AND ISNULL(w.CompanyId, 0) <> 0;
GO


/* =====================================================================
   2. Report tables used by the inventory reports
   ---------------------------------------------------------------------
   dbo.ReportSavedView  - per-user saved column/filter presets
   dbo.ReportRoleAccess - which roles may see cost / value columns

   Both are keyed by report-key string, so the eight INV_* keys need no rows
   of their own: the '*' rules seeded below already cover them. Created only
   if missing - on a database that already has them nothing happens.
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

/* Access is DENY BY DEFAULT: a role sees cost / value columns only when a row
   here grants it. Seeded for administrative roles so applying this never locks
   an administrator out. ReportKey '*' means every report. */
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


/* =====================================================================
   3. Inventory report menu permissions
   ---------------------------------------------------------------------
   dbo.OrganizationRole.RolesJSON is a stored snapshot of the function list,
   so roles saved before this release have no entry for the inventory report
   screens - and a missing FunctionId reads as View = false, which hides the
   whole Inventory > Report menu and every card on the hub.

   This appends the nine missing entries to each OrganizationRole. View /
   Export / Print are granted only where the role can already see the Item
   Master ('im-list'), so nothing is widened; roles without inventory access
   get the entries unticked for an administrator to grant. Reports are
   read-only, so Create / Edit / Delete are never set.

   Re-running is safe: entries already present are skipped, and permissions an
   administrator has since changed by hand are left alone.
   ===================================================================== */

DECLARE @Fns TABLE (Seq INT IDENTITY(1,1) PRIMARY KEY, FunctionId NVARCHAR(100), FunctionTitle NVARCHAR(200));
INSERT INTO @Fns (FunctionId, FunctionTitle) VALUES
    ('inventory-report',                'Report'),
    ('inventory-report-stock-summary',  'Stock Summary'),
    ('inventory-report-valuation',      'Valuation by Category'),
    ('inventory-report-movement',       'Stock Movement'),
    ('inventory-report-adjustments',    'Stock Adjustments'),
    ('inventory-report-transfers',      'Transfers and Requisitions'),
    ('inventory-report-variance',       'Stock Take Variance'),
    ('inventory-report-reorder',        'Reorder / Low Stock'),
    ('inventory-report-cogs',           'COGS / Consumption');

DECLARE @RoleId INT, @Json NVARCHAR(MAX), @Grant BIT, @GrantTxt NVARCHAR(10),
        @Seq INT, @MaxSeq INT, @FnId NVARCHAR(100), @FnTitle NVARCHAR(200),
        @Entry NVARCHAR(MAX), @Added INT = 0, @RolesTouched INT = 0;

SELECT @MaxSeq = MAX(Seq) FROM @Fns;

DECLARE role_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT Id, RolesJSON FROM dbo.OrganizationRole
    WHERE RolesJSON IS NOT NULL AND ISJSON(RolesJSON) = 1;

OPEN role_cur;
FETCH NEXT FROM role_cur INTO @RoleId, @Json;

WHILE @@FETCH_STATUS = 0
BEGIN
    /* Mirror whatever view access this role already has to the Item Master. */
    SELECT @Grant = CASE WHEN EXISTS (
        SELECT 1 FROM OPENJSON(@Json)
        WHERE JSON_VALUE(value, '$.FunctionId') = 'im-list'
          AND JSON_VALUE(value, '$.Permissions.View') = 'true'
    ) THEN 1 ELSE 0 END;

    SET @GrantTxt = CASE WHEN @Grant = 1 THEN 'true' ELSE 'false' END;
    SET @Seq = 1;

    WHILE @Seq <= @MaxSeq
    BEGIN
        SELECT @FnId = FunctionId, @FnTitle = FunctionTitle FROM @Fns WHERE Seq = @Seq;

        IF NOT EXISTS (SELECT 1 FROM OPENJSON(@Json)
                       WHERE JSON_VALUE(value, '$.FunctionId') = @FnId)
        BEGIN
            SET @Entry =
                '{"ModuleId":"inventory","ModuleTitle":"Inventory",' +
                '"FunctionId":"' + @FnId + '","FunctionTitle":"' + @FnTitle + '",' +
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


/* =====================================================================
   4. HEALTH CHECKS - read the output, nothing is modified here
   ===================================================================== */

PRINT '--- 4a. Inventory report permissions per role (expect 9 each) ---';
SELECT o.Id AS OrganizationRoleId,
       o.UserId,
       InventoryReportFns = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'inventory-report%'),
       GrantedView       = (SELECT COUNT(*) FROM OPENJSON(o.RolesJSON)
                             WHERE JSON_VALUE(value, '$.FunctionId') LIKE 'inventory-report%'
                               AND JSON_VALUE(value, '$.Permissions.View') = 'true')
FROM dbo.OrganizationRole o
WHERE o.RolesJSON IS NOT NULL AND ISJSON(o.RolesJSON) = 1
ORDER BY o.Id;
GO

PRINT '--- 4b. Rows with no CompanyId (these become invisible once reads are scoped) ---';
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
GO

PRINT '--- 4c. Requisitions owned by a different company than their outlet ---';
/* A requisition belongs to the outlet it is raised for. Raising one from
   "All companies" used to stamp the caller's company instead, which hid it
   from the outlet that had to act on it. */
SELECT mr.Id, mr.ReqNo, mr.CompanyId AS RequisitionCompanyId,
       mr.OutletId AS WarehouseId, w.Name AS WarehouseName,
       w.CompanyId AS WarehouseCompanyId
FROM dbo.MaterialRequisition mr
INNER JOIN dbo.Warehouse w ON w.Id = mr.OutletId
WHERE ISNULL(w.CompanyId,0) <> 0
  AND ISNULL(mr.CompanyId,0) <> w.CompanyId;
GO

PRINT '--- 4d. Negative stock, and transfers received but never closed ---';
/* Both are fingerprints of the pre-fix transfer bugs: the source was never
   deducted, and a receipt never set Status = 3, so the same transfer could be
   received repeatedly. */
SELECT 'Negative stock' AS Issue, s.Id, s.ItemId, s.WarehouseId, s.OnHand, s.Available, s.Qty
FROM dbo.ItemWarehouseStock s
WHERE s.OnHand < 0 OR s.Available < 0;

SELECT 'Received but still open' AS Issue, st.ID, st.TransferNo, st.Status,
       st.FromWarehouseID, st.ToWarehouseID, st.MrId
FROM dbo.Stock st
INNER JOIN dbo.MaterialRequisitionLine mrl
        ON mrl.MaterialReqId = st.MrId AND mrl.ItemId = st.ItemId
WHERE ISNULL(st.Status,0) <> 3
  AND ISNULL(mrl.ReceivedQty,0) > 0;
GO


/* =====================================================================
   5. OPTIONAL REPAIRS - only if section 4 reported rows
   ---------------------------------------------------------------------
   Deliberately commented out. Read 4b / 4c / 4d first, then uncomment only
   what applies. Take a backup before running any of it.
   ===================================================================== */

/* 5a. Requisitions stamped with the wrong company (from 4c).
       Moves the requisition, and its lines, to the outlet that owns it. */
-- UPDATE mr SET mr.CompanyId = w.CompanyId
-- FROM dbo.MaterialRequisition mr
-- INNER JOIN dbo.Warehouse w ON w.Id = mr.OutletId
-- WHERE ISNULL(w.CompanyId,0) <> 0 AND ISNULL(mr.CompanyId,0) <> w.CompanyId;

-- UPDATE l SET l.CompanyId = h.CompanyId
-- FROM dbo.MaterialRequisitionLine l
-- INNER JOIN dbo.MaterialRequisition h ON h.Id = l.MaterialReqId
-- WHERE ISNULL(l.CompanyId,0) <> h.CompanyId;

/* 5b. Line rows created without a company (from 4b). Each takes the company
       from its parent; a child whose parent is also orphaned is left alone. */
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

-- UPDATE s SET s.CompanyId = w.CompanyId
-- FROM dbo.ItemWarehouseStock s
-- INNER JOIN dbo.Warehouse w ON w.Id = s.WarehouseId
-- WHERE ISNULL(s.CompanyId,0) = 0 AND ISNULL(w.CompanyId,0) <> 0;

/* 5c. Stock damaged by a transfer received more than once (from 4d).
       There is no safe generic formula - set each item/warehouse to its true
       counted quantity, for example: */
-- UPDATE dbo.ItemWarehouseStock
-- SET OnHand = <counted>, Available = <counted>, Qty = <counted>
-- WHERE ItemId = <itemId> AND WarehouseId = <warehouseId>;

/* 5d. Close transfers that were received but left open (from 4d). */
-- UPDATE dbo.Stock SET Status = 3 WHERE ID IN (<ids from 4d>);
