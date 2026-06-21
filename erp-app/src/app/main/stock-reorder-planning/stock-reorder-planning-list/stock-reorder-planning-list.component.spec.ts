import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StockReorderPlanningListComponent } from './stock-reorder-planning-list.component';

describe('StockReorderPlanningListComponent', () => {
  let component: StockReorderPlanningListComponent;
  let fixture: ComponentFixture<StockReorderPlanningListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StockReorderPlanningListComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StockReorderPlanningListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
