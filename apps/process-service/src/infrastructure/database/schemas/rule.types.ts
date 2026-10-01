export enum Operator {
  GT = 'GT',
  LT = 'LT',
  EQ = 'EQ',
}

export interface IRuleCondition {
  field: string;
  operator: Operator;
  value: number;
}
