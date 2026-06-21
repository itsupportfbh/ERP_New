import { TestBed } from '@angular/core/testing';

import { MaterialRequisitionService } from './material-requisition.service';

describe('MaterialRequisitionService', () => {
  let service: MaterialRequisitionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MaterialRequisitionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
