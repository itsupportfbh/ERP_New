-- Supplier: add a supplier-level tax rate (TaxPercentage).
--
-- The Purchase Order's GST % previously derived only from the supplier's country
-- (Country.GSTPercentage). Suppliers can now carry their own rate, which the PO
-- form applies first. Precedence is: Suppliers.TaxPercentage -> Country.GSTPercentage -> 0.
--
-- NULL is meaningful: it means "no supplier rate set, use the country rate".
-- 0 means the supplier is genuinely zero-rated. Do NOT backfill NULL to 0 --
-- that would pin every existing supplier at 0% and break the country fallback.
--
-- The API must also return TaxPercentage from Suppliers/getAllSupplier and
-- accept it on CreateSupplier / updateSupplier, or the PO will never see it.
--
-- Run ONCE on the target database. Safe to re-run (guards for existing columns).

IF COL_LENGTH('dbo.Suppliers', 'TaxPercentage') IS NULL
    ALTER TABLE dbo.Suppliers ADD TaxPercentage DECIMAL(5, 2) NULL;
GO

-- Optional: pre-seed specific suppliers with a rate that differs from their
-- country default. Leave the rest NULL so they keep following the country.
-- UPDATE dbo.Suppliers SET TaxPercentage = 9.00 WHERE SupplierName = 'XYZ Supplier Construction';
-- UPDATE dbo.Suppliers SET TaxPercentage = 0.00 WHERE SupplierName = 'Some Zero-Rated Vendor';
-- GO
