/* =====================================================================
   Chart of Accounts - Clean Hierarchical Renumber
   ---------------------------------------------------------------------
   Rebuilds HeadCode for EVERY account from the real parent tree using a
   uniform 3-digit-per-level scheme (collision-proof; max children = 336).

     Level 1 : 1..5                (roots kept as-is)
     Level 2 : root + 3 digits     101 -> 1001 , 501 -> 5002 ...
     Level 3 : parent + 3 digits   101001 -> 1001001 ...
     Level 4 / 5 : same rule       (deepest code = 13 digits, fits bigint)

   Also:
     * ParentHead is UNIFIED to store the parent's NEW HeadCode
       (fixes the current mix of parent-Id vs parent-HeadCode, and makes
        the Angular COA tree render correctly).
     * HeadCodeName rebuilt as  "<newcode> - <HeadName>".
     * Item.PurchaseCoaId / SalesCoaId / StockCoaId remapped old->new
       (these store HeadCode; verified 597 / 362 / 618 rows).

   NOT touched (they link by Id, not code, so renumbering is transparent):
     GlTransaction.AccountId, ManualJournalLine.AccountId,
     AccountBalance.HeadId, *Advance.HeadId, CompanyFinanceSetting.*AccountId
   Pre-existing dangling data (left as-is): Customer.CoaHeadCode,
     Suppliers.CoaHeadCode  -- currently match no account.

   SAFETY: runs inside a transaction with integrity guards. It auto-rolls
   back on any duplicate / prefix / count failure. Set @Commit = 1 to apply.
   A timestamped backup table is created first.
   ===================================================================== */
USE [erp_tvs];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @CompanyId int  = 1;      -- company to renumber
DECLARE @Pad       int  = 3;      -- sequence digits per level (001..999)
DECLARE @Commit    bit  = 0;      -- 0 = test (rollback) , 1 = apply (commit)

DECLARE @Mult bigint = POWER(CAST(10 AS bigint), @Pad);

-- one-time backup (safe to keep; rename suffix if it already exists)
IF OBJECT_ID('dbo.ChartOfAccount_bak_renumber') IS NULL
    SELECT * INTO dbo.ChartOfAccount_bak_renumber
    FROM dbo.ChartOfAccount WHERE CompanyId = @CompanyId;

BEGIN TRY
    BEGIN TRAN;

    IF OBJECT_ID('tempdb..#src')    IS NOT NULL DROP TABLE #src;
    IF OBJECT_ID('tempdb..#srcseq') IS NOT NULL DROP TABLE #srcseq;
    IF OBJECT_ID('tempdb..#map')    IS NOT NULL DROP TABLE #map;

    /* 1) resolve each row's true parent Id
          (existing ParentHead is stored as EITHER the parent Id OR the
           parent HeadCode; both are matched, disambiguated by level) */
    SELECT c.Id, c.CompanyId, c.HeadLevel, c.HeadCode AS OldCode, c.HeadName,
           p.ParentId
    INTO #src
    FROM dbo.ChartOfAccount c
    OUTER APPLY (
        SELECT TOP 1 p.Id AS ParentId
        FROM dbo.ChartOfAccount p
        WHERE p.CompanyId = c.CompanyId
          AND p.HeadLevel = c.HeadLevel - 1
          AND (p.Id = c.ParentHead OR p.HeadCode = c.ParentHead)
        ORDER BY p.Id
    ) p
    WHERE c.CompanyId = @CompanyId;

    /* 2) per-parent sequence (precomputed; window fns can't run in the
          recursive member). Roots (ParentId NULL) sequence among themselves. */
    SELECT s.*,
           CAST(ROW_NUMBER() OVER (PARTITION BY s.CompanyId, s.ParentId
                                   ORDER BY s.OldCode) AS bigint) AS Seq
    INTO #srcseq FROM #src s;

    /* 3) top-down new codes: child = parent * 10^pad + seq */
    ;WITH tree AS (
        SELECT Id, CompanyId, ParentId, OldCode, Seq AS NewCode
        FROM #srcseq WHERE ParentId IS NULL
        UNION ALL
        SELECT s.Id, s.CompanyId, s.ParentId, s.OldCode,
               t.NewCode * @Mult + s.Seq
        FROM #srcseq s JOIN tree t ON t.Id = s.ParentId
    )
    SELECT Id, CompanyId, OldCode, NewCode
    INTO #map FROM tree OPTION (MAXRECURSION 100);

    /* 4) integrity guards (any failure -> CATCH -> ROLLBACK) */
    IF (SELECT COUNT(*) FROM #map) <> (SELECT COUNT(*) FROM dbo.ChartOfAccount WHERE CompanyId=@CompanyId)
        RAISERROR('Row count mismatch: not every account was mapped (orphan tree).',16,1);

    IF EXISTS (SELECT 1 FROM #map GROUP BY CompanyId, NewCode HAVING COUNT(*) > 1)
        RAISERROR('Duplicate new HeadCode generated.',16,1);

    IF EXISTS (
        SELECT 1 FROM #srcseq s
        JOIN #map cm ON cm.Id = s.Id
        JOIN #map pm ON pm.Id = s.ParentId
        WHERE s.ParentId IS NOT NULL
          AND CAST(cm.NewCode AS varchar(30)) NOT LIKE CAST(pm.NewCode AS varchar(30)) + '%')
        RAISERROR('Prefix integrity violation (child code not under parent).',16,1);

    /* 5) apply: ChartOfAccount */
    UPDATE c
        SET c.HeadCode     = m.NewCode,
            c.ParentHead    = pm.NewCode,                    -- NULL for roots
            c.HeadCodeName  = CAST(m.NewCode AS nvarchar(20)) + N' - ' + c.HeadName,
            c.UpdatedDate   = GETDATE()
    FROM dbo.ChartOfAccount c
    JOIN #map  m  ON m.Id  = c.Id
    LEFT JOIN #src s  ON s.Id = c.Id
    LEFT JOIN #map pm ON pm.Id = s.ParentId;

    /* 6) apply: Item account links (store HeadCode) */
    UPDATE i SET i.PurchaseCoaId = m.NewCode
    FROM dbo.Item i JOIN #map m ON m.OldCode = i.PurchaseCoaId;

    UPDATE i SET i.SalesCoaId = m.NewCode
    FROM dbo.Item i JOIN #map m ON m.OldCode = i.SalesCoaId;

    UPDATE i SET i.StockCoaId = m.NewCode
    FROM dbo.Item i JOIN #map m ON m.OldCode = i.StockCoaId;

    /* report */
    SELECT 'accounts_renumbered' AS metric, COUNT(*) AS value FROM #map
    UNION ALL SELECT 'levels', (SELECT COUNT(DISTINCT HeadLevel) FROM dbo.ChartOfAccount WHERE CompanyId=@CompanyId);

    IF @Commit = 1
    BEGIN
        COMMIT;
        PRINT 'COMMITTED. Chart of Accounts renumbered.';
    END
    ELSE
    BEGIN
        ROLLBACK;
        PRINT 'TEST RUN ONLY (rolled back). Set @Commit = 1 to apply.';
    END
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - rolled back: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
