import { EvaluatorService } from './evaluator.service';
import { Operator } from '../../infrastructure/database/schemas/rule.types';
import type { Rule } from '../../infrastructure/database/schemas/rule.schema';

describe('EvaluatorService', () => {
  let evaluator: EvaluatorService;

  beforeEach(() => {
    evaluator = new EvaluatorService();
  });

  const ruleGT: Partial<Rule> = {
    _id: 'rule-1' as any,
    name: 'Value > 50',
    isActive: true,
    conditions: [{ field: 'value', operator: Operator.GT, value: 50 }],
  };

  const ruleLT: Partial<Rule> = {
    _id: 'rule-2' as any,
    name: 'Value < 30',
    isActive: true,
    conditions: [{ field: 'value', operator: Operator.LT, value: 30 }],
  };

  const ruleEQ: Partial<Rule> = {
    _id: 'rule-3' as any,
    name: 'Value == 42',
    isActive: true,
    conditions: [{ field: 'value', operator: Operator.EQ, value: 42 }],
  };

  it('evaluates GT condition correctly', () => {
    const matches = evaluator.evaluate({ name: 'sensor', value: 55 }, [ruleGT as Rule]);
    expect(matches).toHaveLength(1);
    expect(matches[0]._id).toBe('rule-1');

    const noMatches = evaluator.evaluate({ name: 'sensor', value: 50 }, [ruleGT as Rule]);
    expect(noMatches).toHaveLength(0);
  });

  it('evaluates LT condition correctly', () => {
    const matches = evaluator.evaluate({ name: 'sensor', value: 25 }, [ruleLT as Rule]);
    expect(matches).toHaveLength(1);
    expect(matches[0]._id).toBe('rule-2');

    const noMatches = evaluator.evaluate({ name: 'sensor', value: 35 }, [ruleLT as Rule]);
    expect(noMatches).toHaveLength(0);
  });

  it('evaluates EQ condition correctly', () => {
    const matches = evaluator.evaluate({ name: 'sensor', value: 42 }, [ruleEQ as Rule]);
    expect(matches).toHaveLength(1);
    expect(matches[0]._id).toBe('rule-3');

    const noMatches = evaluator.evaluate({ name: 'sensor', value: 43 }, [ruleEQ as Rule]);
    expect(noMatches).toHaveLength(0);
  });

  it('handles zero matching rules (returns empty array)', () => {
    const matches = evaluator.evaluate({ name: 'sensor', value: 35 }, [
      ruleGT as Rule,
      ruleLT as Rule,
      ruleEQ as Rule,
    ]);
    expect(matches).toHaveLength(0);
  });

  it('handles multiple matching rules for a single event', () => {
    const ruleAnotherGT: Partial<Rule> = {
      _id: 'rule-4' as any,
      name: 'Value > 10',
      isActive: true,
      conditions: [{ field: 'value', operator: Operator.GT, value: 10 }],
    };

    const matches = evaluator.evaluate({ name: 'sensor', value: 60 }, [
      ruleGT as Rule,
      ruleAnotherGT as Rule,
    ]);
    expect(matches).toHaveLength(2);
    expect(matches.map((r) => r._id)).toEqual(['rule-1', 'rule-4']);
  });

  it('handles missing payload field gracefully without matching', () => {
    const ruleUnknownField: Partial<Rule> = {
      _id: 'rule-5' as any,
      name: 'Pressure > 10',
      isActive: true,
      conditions: [{ field: 'pressure', operator: Operator.GT, value: 10 }],
    };

    const matches = evaluator.evaluate({ name: 'sensor', value: 100 }, [ruleUnknownField as Rule]);
    expect(matches).toHaveLength(0);
  });
});
