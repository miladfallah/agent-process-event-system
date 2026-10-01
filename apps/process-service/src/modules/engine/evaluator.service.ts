import { Injectable } from '@nestjs/common';
import { Rule, Operator } from '../../infrastructure/database/schemas/rule.schema';

@Injectable()
export class EvaluatorService {
  /**
   * Pure evaluation logic evaluating an event against a list of active rules.
   */
  evaluate(eventPayload: { name: string; value: number }, activeRules: Rule[]): Rule[] {
    const matchedRules: Rule[] = [];

    for (const rule of activeRules) {
      if (this.doesRuleMatch(eventPayload, rule)) {
        matchedRules.push(rule);
      }
    }

    return matchedRules;
  }

  private doesRuleMatch(payload: { name: string; value: number }, rule: Rule): boolean {
    if (!rule.conditions || rule.conditions.length === 0) return false;

    for (const condition of rule.conditions) {
      // In this simple domain, only 'value' and 'name' are checked. 
      // Extendable to nested fields via lodash.get if needed.
      const payloadValue = payload[condition.field];
      
      if (payloadValue === undefined) return false;

      switch (condition.operator) {
        case Operator.GT:
          if (!(payloadValue > condition.value)) return false;
          break;
        case Operator.LT:
          if (!(payloadValue < condition.value)) return false;
          break;
        case Operator.EQ:
          if (!(payloadValue === condition.value)) return false;
          break;
        default:
          return false; // Unknown operator
      }
    }

    return true;
  }
}
