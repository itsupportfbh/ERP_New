export interface CogsSummary {
  periodFrom?: string;
  periodTo?: string;
  openingStock?: number;
  purchases?: number;
  closingStock?: number;
  goodsAvailable?: number;
  cogs?: number;
}

export interface CogsItemRow {
  itemId: number;
  itemCode?: string;
  itemName?: string;
  itemText?: string;

  baseUomName?: string;
  purchaseUomName?: string;

  openingBaseQty?: number;
  openingQty?: number;

  purchaseBaseQty?: number;
  purchaseQty?: number;

  closingBaseQty?: number;
  closingQty?: number;

  issueBaseQty?: number;
  issueQty?: number;

  avgCost?: number;

  openingValue?: number;
  purchaseValue?: number;
  closingValue?: number;
  cogsValue?: number;
}

export interface CogsReport {
  summary: CogsSummary;
  items: CogsItemRow[];
}