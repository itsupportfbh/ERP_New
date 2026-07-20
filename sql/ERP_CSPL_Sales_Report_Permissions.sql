/* Add per-report Sales permission rows without changing any existing permission. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.OrganizationRole_Backup_ReportPermissions_20260720', N'U') IS NULL
BEGIN
    SELECT *, SYSDATETIME() AS BackupTakenAt
    INTO dbo.OrganizationRole_Backup_ReportPermissions_20260720
    FROM dbo.OrganizationRole;
END;

;WITH Existing AS
(
    SELECT
        r.Id,
        rawRole.[key] AS SortOrder,
        j.ModuleId,
        j.ModuleTitle,
        j.FunctionId,
        j.FunctionTitle,
        j.Permissions
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
),
ReportChildren AS
(
    SELECT * FROM (VALUES
        (N'sales-report-by-item',        N'Sales By Item'),
        (N'sales-report-average-margin', N'Average Margin'),
        (N'sales-report-deliveries',     N'Deliveries'),
        (N'sales-report-delivery-note',  N'Delivery Note Summary')
    ) AS v(FunctionId, FunctionTitle)
),
Merged AS
(
    SELECT Id, SortOrder, ModuleId, ModuleTitle, FunctionId, FunctionTitle, Permissions
    FROM Existing

    UNION ALL

    SELECT
        role.Id,
        1000 + ROW_NUMBER() OVER (PARTITION BY role.Id ORDER BY child.FunctionId),
        N'sales', N'Sales', child.FunctionId, child.FunctionTitle,
        parent.Permissions
    FROM dbo.OrganizationRole AS role
    CROSS JOIN ReportChildren AS child
    CROSS APPLY
    (
        SELECT TOP (1) e.Permissions
        FROM Existing AS e
        WHERE e.Id = role.Id AND e.FunctionId = N'sales-report'
    ) AS parent
    WHERE NOT EXISTS
    (
        SELECT 1 FROM Existing AS currentRole
        WHERE currentRole.Id = role.Id AND currentRole.FunctionId = child.FunctionId
    )
),
Rebuilt AS
(
    SELECT
        role.Id,
        (
            SELECT
                item.ModuleId,
                item.ModuleTitle,
                item.FunctionId,
                item.FunctionTitle,
                JSON_QUERY(item.Permissions) AS Permissions
            FROM Merged AS item
            WHERE item.Id = role.Id
            ORDER BY item.SortOrder
            FOR JSON PATH
        ) AS RolesJSON
    FROM dbo.OrganizationRole AS role
)
UPDATE role
SET role.RolesJSON = rebuilt.RolesJSON,
    role.UpdatedDate = GETDATE()
FROM dbo.OrganizationRole AS role
INNER JOIN Rebuilt AS rebuilt ON rebuilt.Id = role.Id;

IF EXISTS
(
    SELECT 1
    FROM dbo.OrganizationRole AS role
    CROSS JOIN (VALUES
        (N'sales-report-by-item'),
        (N'sales-report-average-margin'),
        (N'sales-report-deliveries'),
        (N'sales-report-delivery-note')
    ) AS child(FunctionId)
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM OPENJSON(role.RolesJSON)
        WITH (FunctionId nvarchar(100) '$.FunctionId') AS saved
        WHERE saved.FunctionId = child.FunctionId
    )
)
    THROW 51001, 'Sales child report permission migration validation failed.', 1;

COMMIT TRANSACTION;

SELECT role.Id, role.UserId, COUNT(*) AS ChildReportCount, MIN(ISJSON(role.RolesJSON)) AS IsValidJson
FROM dbo.OrganizationRole AS role
CROSS APPLY OPENJSON(role.RolesJSON)
WITH (FunctionId nvarchar(100) '$.FunctionId') AS saved
WHERE saved.FunctionId LIKE N'sales-report-%'
GROUP BY role.Id, role.UserId;
