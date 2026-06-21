import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListStockTransferReceiptComponent } from './list-stock-transfer-receipt.component';

describe('ListStockTransferReceiptComponent', () => {
  let component: ListStockTransferReceiptComponent;
  let fixture: ComponentFixture<ListStockTransferReceiptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListStockTransferReceiptComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListStockTransferReceiptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
