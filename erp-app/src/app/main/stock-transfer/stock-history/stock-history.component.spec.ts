import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StockHistoryComponent } from './stock-history.component';

describe('StockHistoryComponent', () => {
  let component: StockHistoryComponent;
  let fixture: ComponentFixture<StockHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StockHistoryComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StockHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
