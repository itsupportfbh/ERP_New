import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StackOverviewComponent } from './stack-overview.component';

describe('StackOverviewComponent', () => {
  let component: StackOverviewComponent;
  let fixture: ComponentFixture<StackOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StackOverviewComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StackOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
