/*
  Purchase Reports — permission seeding for a LIVE tenant database.

  Adds the `purchase-report` menu permission plus the sixteen per-report
  permissions to every dbo.OrganizationRole row that does not already have them.

  Why this exists separately from OrganizationRole_Permission_Catalog_Migration.sql:
  that script rebuilds RolesJSON for the whole catalog, which is fine for
  ERP_Template but is more surface area than you want on a live tenant. This one
  only appends the missing purchase-report entries and leaves every existing
  entry — and its current permission values — byte-for-byte untouched.

  Safe to run repeatedly: rows that already contain a FunctionId are skipped.

  RUN AGAINST: the tenant database (e.g. ERP_CSPL), NOT ERP_Master.
  ERP_Template is already seeded via the catalog migration.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ---------------------------------------------------------------------------
   Grant level for the newly added functions.
     1 = full permissions (View/Create/Edit/.../Export/Print/Post) — matches how
         the catalog migration seeds new functions.
     0 = View + Export + Print only. Reports are read-only surfaces, so this is
         the tighter, more accurate choice for a live system.
   Reports cannot create or post anything, so 0 is recommended unless you want
   these to look identical to the ERP_Template rows.
--------------------------------------------------------------------------- */
DECLARE @GrantFullPermissions bit = 0;

DECLARE @Permissions nvarchar(max) =
    CASE WHEN @GrantFullPermissions = 1
         THEN N'{"View":true,"Create":true,"Edit":true,"Delete":true,"Submit":true,
                 "Approve":true,"Reject":true,"Cancel":true,"Export":true,"Print":true,"Post":true}'
         ELSE N'{"View":true,"Create":false,"Edit":false,"Delete":false,"Submit":false,
                 "Approve":false,"Reject":false,"Cancel":false,"Export":true,"Print":true,"Post":false}'
    END;

/* Strip the formatting whitespace so the stored JSON stays compact. */
SET @Permissions = REPLACE(REPLACE(REPLACE(@Permissions, CHAR(13), N''), CHAR(10), N''), N' ', N'');

DECLARE @NewFunctions TABLE
(
    Ordinal       int IDENTITY(1,1),
    FunctionId    nvarchar(100),
    FunctionTitle nvarchar(200)
);

INSERT INTO @NewFunctions (FunctionId, FunctionTitle)
VALUES
    (N'purchase-report',                N'Purchase Reports'),
    (N'purchase-report-pr-register',    N'PR Register'),
    (N'purchase-report-pr-pending',     N'Pending PR Approvals'),
    (N'purchase-report-pr-by-dept',     N'PR by Department'),
    (N'purchase-report-po-register',    N'PO Register'),
    (N'purchase-report-po-open',        N'Open PO / Outstanding Deliveries'),
    (N'purchase-report-po-by-supplier', N'PO Summary by Supplier'),
    (N'purchase-report-grn-register',   N'GRN Register'),
    (N'purchase-report-grn-quality',    N'Quality Check / Rejections'),
    (N'purchase-report-grn-variance',   N'PO vs GRN Variance'),
    (N'purchase-report-pin-register',   N'Supplier Invoice Register'),
    (N'purchase-report-pin-match',      N'3-Way Match Exceptions'),
    (N'purchase-report-pin-payable',    N'Outstanding Payables'),
    (N'purchase-report-dn-register',    N'Debit Note Register'),
    (N'purchase-report-spend-trend',    N'Monthly Spend Trend'),
    (N'purchase-report-scorecard',      N'Supplier Scorecard Report'),
    (N'purchase-report-p2p-cycle',      N'Procure-to-Pay Cycle');

/* ---- before ---- */
SELECT COUNT(*) AS RolesTotal,
       SUM(CASE WHEN RolesJSON LIKE N'%"purchase-report"%' THEN 1 ELSE 0 END) AS RolesAlreadySeeded
FROM dbo.OrganizationRole;

BEGIN TRANSACTION;

/* Append each missing function to the end of the role's JSON array.
   JSON_MODIFY with 'append $' preserves the existing elements exactly. */
;WITH Missing AS
(
    SELECT r.Id AS RoleId, f.Ordinal, f.FunctionId, f.FunctionTitle
    FROM dbo.OrganizationRole AS r
    CROSS JOIN @NewFunctions AS f
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM OPENJSON(r.RolesJSON)
        WITH (FunctionId nvarchar(100) '$.FunctionId') AS j
        WHERE j.FunctionId = f.FunctionId
    )
)
SELECT RoleId, Ordinal, FunctionId, FunctionTitle
INTO #ToAdd
FROM Missing;

DECLARE @RoleId int, @FunctionId nvarchar(100), @FunctionTitle nvarchar(200);

DECLARE add_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT RoleId, FunctionId, FunctionTitle FROM #ToAdd ORDER BY RoleId, Ordinal;

OPEN add_cur;
FETCH NEXT FROM add_cur INTO @RoleId, @FunctionId, @FunctionTitle;

WHILE @@FETCH_STATUS = 0
BEGIN
    UPDATE dbo.OrganizationRole
    SET RolesJSON = JSON_MODIFY(
            RolesJSON,
            'append $',
            JSON_QUERY(
                N'{"ModuleId":"purchase","ModuleTitle":"Purchase","FunctionId":"'
                + @FunctionId + N'","FunctionTitle":"'
                + REPLACE(@FunctionTitle, N'"', N'\"') + N'","Permissions":'
                + @Permissions + N'}'
            )
        ),
        UpdatedDate = GETDATE()
    WHERE Id = @RoleId;

    FETCH NEXT FROM add_cur INTO @RoleId, @FunctionId, @FunctionTitle;
END

CLOSE add_cur;
DEALLOCATE add_cur;
DROP TABLE #ToAdd;

/* Guard: refuse to commit if any RolesJSON was corrupted into invalid JSON. */
IF EXISTS (SELECT 1 FROM dbo.OrganizationRole WHERE ISJSON(RolesJSON) <> 1)
BEGIN
    ROLLBACK TRANSACTION;
    THROW 50001, N'Aborted: RolesJSON would no longer be valid JSON. No changes were saved.', 1;
END

COMMIT TRANSACTION;

/* ---- after: every role should list all 17 ---- */
SELECT r.Id AS RoleId,
       r.UserId,
       COUNT(j.FunctionId) AS PurchaseReportFunctions   -- expect 17
FROM dbo.OrganizationRole AS r
CROSS APPLY OPENJSON(r.RolesJSON)
     WITH (FunctionId nvarchar(100) '$.FunctionId') AS j
WHERE j.FunctionId LIKE N'purchase-report%'
GROUP BY r.Id, r.UserId
ORDER BY r.Id;
