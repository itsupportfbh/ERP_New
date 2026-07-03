-- Fix: AR receipt GL posting must credit AR in BASE currency (× receipt FxRate),
-- and stamp the real CurrencyId. Previously AmountBase = document amount (no conversion),
-- which corrupted the Trial Balance for foreign-currency receipts.
--
-- Pairs with ArReceiptRepository.PostArFxGainLossAsync (realized FX gain/loss): this proc
-- credits AR at receiptBase; the C# posting clears the (invoiceBase − receiptBase) residual
-- to Exchange Gain/Loss. Deploy BOTH together (this script + the rebuilt FinanceApi).

ALTER PROCEDURE [dbo].[sp_PostArReceiptToGl]
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
        @CompanyId   = CASE
                          WHEN ISNULL(@CompanyId, 0) = 0
                              THEN ISNULL(r.CompanyId, 0)
                          ELSE @CompanyId
                       END
    FROM dbo.ArReceipt r
    WHERE r.Id = @ReceiptId;

    IF @ReceiptDate IS NULL
    BEGIN
        RAISERROR('Receipt not found.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@CompanyId, 0) = 0
    BEGIN
        RAISERROR('CompanyId is required.', 16, 1);
        RETURN;
    END;

    INSERT INTO dbo.GlTransaction
    (
        AccountId,
        TxnDate,
        CurrencyId,
        AmountFC,
        AmountBase,
        CompanyId
    )
    SELECT
        c.BudgetLineId                                 AS AccountId,
        @ReceiptDate                                   AS TxnDate,
        @CurrencyId                                    AS CurrencyId,
        -SUM(ISNULL(a.AllocatedAmount, 0))             AS AmountFC,      -- document currency
        -SUM(ISNULL(a.AllocatedAmount, 0)) * @FxRate   AS AmountBase,    -- base currency
        @CompanyId                                     AS CompanyId
    FROM dbo.ArReceiptAllocation a
    INNER JOIN dbo.ArReceipt r
        ON r.Id = a.ReceiptId
    INNER JOIN dbo.Customer c
        ON c.Id = r.CustomerId
    WHERE a.ReceiptId = @ReceiptId
      AND a.IsActive = 1
      AND c.BudgetLineId IS NOT NULL
      AND r.CompanyId = @CompanyId
    GROUP BY c.BudgetLineId;
END;
