/* =====================================================================================
   TENANT DB MIGRATION — Currency display + FX/GL base conversion
   -------------------------------------------------------------------------------------
   Run this ONCE on EVERY tenant/company database (ERP_<CODE>): ERP_TVS, ERP_CSSB,
   ERP_FBH, ... AND on ERP_Template (so newly-created companies inherit it).
   Idempotent + safe to re-run. Sections 1-3 are universal; Section 4 is per-DB (adjust).

   Backend/Frontend CODE changes deploy via the rebuilt binaries — NOT part of this script.
   ===================================================================================== */

SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   1) SCHEMA — new columns (code references these; required)
   --------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.Currency','Symbol')        IS NULL ALTER TABLE dbo.Currency ADD Symbol         NVARCHAR(10) NULL;  -- currency symbol: RM / S$ / $ / ?
IF COL_LENGTH('dbo.Country','TaxName')        IS NULL ALTER TABLE dbo.Country  ADD TaxName        NVARCHAR(20) NULL;  -- GST / SST / VAT
IF COL_LENGTH('dbo.Country','CurrencySymbol') IS NULL ALTER TABLE dbo.Country  ADD CurrencySymbol NVARCHAR(10) NULL;  -- country currency symbol
IF COL_LENGTH('dbo.ItemSet','SalesParentHeadCode') IS NULL ALTER TABLE dbo.ItemSet ADD SalesParentHeadCode INT NULL; -- package COA for Sales Invoice / Credit Note GL
GO

SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   2) UNIVERSAL DATA — currency symbols + country tax/symbol
      (edit to match the currencies/countries actually in each DB)
   --------------------------------------------------------------------------- */
UPDATE dbo.Currency SET Symbol='S$' WHERE UPPER(CurrencyName) IN ('SGD','SINGAPORE DOLLAR')            AND (Symbol IS NULL OR Symbol='');
UPDATE dbo.Currency SET Symbol='RM' WHERE UPPER(CurrencyName) IN ('MYR','RINGGIT','MALAYSIAN RINGGIT') AND (Symbol IS NULL OR Symbol='');
UPDATE dbo.Currency SET Symbol='$'  WHERE UPPER(CurrencyName) IN ('USD','US DOLLAR')                   AND (Symbol IS NULL OR Symbol='');
UPDATE dbo.Currency SET Symbol=N'₹' WHERE UPPER(CurrencyName) IN ('INR','RUPEE','INDIAN RUPEE')        AND (Symbol IS NULL OR Symbol='');

UPDATE dbo.Country SET TaxName='SST', CurrencySymbol='RM'  WHERE CountryName='Malaysia';
UPDATE dbo.Country SET TaxName='GST', CurrencySymbol='S$'  WHERE CountryName='Singapore';
UPDATE dbo.Country SET TaxName='GST', CurrencySymbol=N'₹'  WHERE CountryName='India';
UPDATE dbo.Country SET TaxName='GST' WHERE TaxName IS NULL;   -- default label for the rest
GO

SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   3) STORED PROC — AR receipt GL must post AmountBase = allocated * receipt FxRate
      (previously posted the document amount into AmountBase with no conversion)
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.sp_PostArReceiptToGl','P') IS NOT NULL
    DROP PROCEDURE dbo.sp_PostArReceiptToGl;
GO
CREATE PROCEDURE [dbo].[sp_PostArReceiptToGl]
(
    @ReceiptId INT,
    @UserId    INT,
    @CompanyId INT = 0
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ReceiptDate DATE;
    DECLARE @CurrencyId  INT = 1;
    DECLARE @FxRate      DECIMAL(18,6) = 1;

    SELECT
        @ReceiptDate = r.ReceiptDate,
        @FxRate      = ISNULL(r.FxRate, 1),
        @CurrencyId  = ISNULL(r.CurrencyId, 1),
        @CompanyId   = CASE WHEN ISNULL(@CompanyId,0)=0 THEN ISNULL(r.CompanyId,0) ELSE @CompanyId END
    FROM dbo.ArReceipt r
    WHERE r.Id = @ReceiptId;

    IF @ReceiptDate IS NULL BEGIN RAISERROR('Receipt not found.', 16, 1); RETURN; END;
    IF ISNULL(@CompanyId, 0) = 0 BEGIN RAISERROR('CompanyId is required.', 16, 1); RETURN; END;

    INSERT INTO dbo.GlTransaction (AccountId, TxnDate, CurrencyId, AmountFC, AmountBase, CompanyId)
    SELECT
        c.BudgetLineId,
        @ReceiptDate,
        @CurrencyId,
        -SUM(ISNULL(a.AllocatedAmount, 0)),               -- document currency
        -SUM(ISNULL(a.AllocatedAmount, 0)) * @FxRate,      -- base currency
        @CompanyId
    FROM dbo.ArReceiptAllocation a
    INNER JOIN dbo.ArReceipt r ON r.Id = a.ReceiptId
    INNER JOIN dbo.Customer c  ON c.Id = r.CustomerId
    WHERE a.ReceiptId = @ReceiptId
      AND a.IsActive = 1
      AND c.BudgetLineId IS NOT NULL
      AND r.CompanyId = @CompanyId
    GROUP BY c.BudgetLineId;
END;
GO

SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   4) PER-DB DATA (adjust per database — DO NOT hardcode ids across DBs)
   --------------------------------------------------------------------------- */

-- 4a) Fix customers pointing to a non-existent AR control account (BudgetLineId).
--     Finds the real "Accounts Receivable" account in THIS db and reassigns broken links.
DECLARE @ArId INT = (SELECT TOP 1 Id FROM dbo.ChartOfAccount
                     WHERE IsActive=1 AND (UPPER(HeadName) LIKE '%RECEIVABLE%' OR UPPER(HeadName) LIKE '%TRADE DEBTOR%')
                     ORDER BY Id);
IF @ArId IS NOT NULL
    UPDATE c SET c.BudgetLineId = @ArId
    FROM dbo.Customer c
    WHERE c.IsActive = 1
      AND (c.BudgetLineId IS NULL
           OR NOT EXISTS (SELECT 1 FROM dbo.ChartOfAccount ca WHERE ca.Id = c.BudgetLineId AND ca.IsActive = 1));

-- 4b) Exchange rates — foreign -> base currency. SET REAL RATES for each company.
--     Example (base = MYR): find currency ids in dbo.Currency, then insert rows.
--     INSERT dbo.ExchangeRate (RateDate, FromCurrencyId, ToCurrencyId, Rate, IsActive, CreatedBy, CreatedDate, CompanyId)
--     VALUES ('2026-01-01', <SGD id>, <MYR id>, 3.30, 1, 1, SYSUTCDATETIME(), <CompanyId>);
GO
