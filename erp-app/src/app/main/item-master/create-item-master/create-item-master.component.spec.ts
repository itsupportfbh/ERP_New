import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateItemMasterComponent } from './create-item-master.component';

describe('CreateItemMasterComponent', () => {
  let component: CreateItemMasterComponent;
  let fixture: ComponentFixture<CreateItemMasterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CreateItemMasterComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateItemMasterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
