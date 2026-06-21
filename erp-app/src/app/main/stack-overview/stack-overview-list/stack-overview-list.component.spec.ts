import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StackOverviewListComponent } from './stack-overview-list.component';

describe('StackOverviewListComponent', () => {
  let component: StackOverviewListComponent;
  let fixture: ComponentFixture<StackOverviewListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StackOverviewListComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StackOverviewListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
