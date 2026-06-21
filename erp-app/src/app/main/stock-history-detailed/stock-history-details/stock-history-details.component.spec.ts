import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StockHistoryDetailsComponent } from './stock-history-details.component';

describe('StockHistoryDetailsComponent', () => {
  let component: StockHistoryDetailsComponent;
  let fixture: ComponentFixture<StockHistoryDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StockHistoryDetailsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StockHistoryDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
