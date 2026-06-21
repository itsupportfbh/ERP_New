import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaterialRequisitionListComponent } from './material-requisition-list.component';

describe('MaterialRequisitionListComponent', () => {
  let component: MaterialRequisitionListComponent;
  let fixture: ComponentFixture<MaterialRequisitionListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MaterialRequisitionListComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MaterialRequisitionListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
