-- Country master: add per-country Tax Name (GST/SST/VAT) and Currency Symbol (S$/RM/₹)
-- Run ONCE on the target database. Safe to re-run (guards for existing columns).

IF COL_LENGTH('dbo.Country', 'TaxName') IS NULL
    ALTER TABLE dbo.Country ADD TaxName NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.Country', 'CurrencySymbol') IS NULL
    ALTER TABLE dbo.Country ADD CurrencySymbol NVARCHAR(10) NULL;
GO

-- Default existing rows to 'GST' so the list still shows a label
UPDATE dbo.Country SET TaxName = 'GST' WHERE TaxName IS NULL;
GO

-- Example values (optional — edit per your countries):
-- UPDATE dbo.Country SET TaxName = 'SST', CurrencySymbol = 'RM'  WHERE CountryName = 'Malaysia';
-- UPDATE dbo.Country SET TaxName = 'GST', CurrencySymbol = 'S$'  WHERE CountryName = 'Singapore';
-- UPDATE dbo.Country SET TaxName = 'GST', CurrencySymbol = N'₹'  WHERE CountryName = 'India';
