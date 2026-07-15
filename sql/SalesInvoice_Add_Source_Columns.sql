-- Sales Invoice header: add Source tracking columns used by the new
-- "From SO / From DO" create flow. The API's INSERT references these columns
-- (SourceType, SourceId, SourceNo, Description); without them Create fails with
-- "Invalid column name 'SourceType'" (SqlException 0x80131904 / HTTP 500).
--
-- Run ONCE on the target database. Safe to re-run (guards for existing columns).
-- Adjust types below if your other SalesInvoice header columns use different sizes.

-- SourceType: 1 = Sales Order, 2 = Delivery Order
IF COL_LENGTH('dbo.SalesInvoice', 'SourceType') IS NULL
    ALTER TABLE dbo.SalesInvoice ADD SourceType INT NULL;
GO

-- SourceId: FK-style id of the source document (SO id or DO id)
IF COL_LENGTH('dbo.SalesInvoice', 'SourceId') IS NULL
    ALTER TABLE dbo.SalesInvoice ADD SourceId INT NULL;
GO

-- SourceNo: human-readable source document number (e.g. 'DO-CSSB-0001-2026-00')
IF COL_LENGTH('dbo.SalesInvoice', 'SourceNo') IS NULL
    ALTER TABLE dbo.SalesInvoice ADD SourceNo NVARCHAR(50) NULL;
GO

-- Description: header-level description / remarks for the invoice
IF COL_LENGTH('dbo.SalesInvoice', 'Description') IS NULL
    ALTER TABLE dbo.SalesInvoice ADD Description NVARCHAR(500) NULL;
GO
