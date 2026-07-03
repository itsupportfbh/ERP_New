-- Currency master: add a display Symbol (e.g. RM, S$, $, ₹) used app-wide for amounts.
-- Multi-currency: each currency shows ITS OWN symbol (base + document-selected).
-- Run ONCE on the target database. Safe to re-run (guards for existing column).

IF COL_LENGTH('dbo.Currency', 'Symbol') IS NULL
    ALTER TABLE dbo.Currency ADD Symbol NVARCHAR(10) NULL;
GO

-- Seed symbols for your currencies (edit to match your Currency master rows):
-- UPDATE dbo.Currency SET Symbol = 'RM'  WHERE UPPER(CurrencyName) IN ('MYR','RINGGIT','MALAYSIAN RINGGIT');
-- UPDATE dbo.Currency SET Symbol = 'S$'  WHERE UPPER(CurrencyName) IN ('SGD','SINGAPORE DOLLAR');
-- UPDATE dbo.Currency SET Symbol = '$'   WHERE UPPER(CurrencyName) IN ('USD','US DOLLAR');
-- UPDATE dbo.Currency SET Symbol = N'₹'  WHERE UPPER(CurrencyName) IN ('INR','RUPEE','INDIAN RUPEE');
