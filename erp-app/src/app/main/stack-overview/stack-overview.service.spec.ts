import { TestBed } from '@angular/core/testing';

import { StackOverviewService } from './stack-overview.service';

describe('StackOverviewService', () => {
  let service: StackOverviewService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StackOverviewService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
