import fs from 'node:fs/promises';
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export interface ScannedChart {
  id: string;
  topic: string;
  title: string;
  description: string;
  related: string[];
  order: number | undefined;
  activeFrom: string;
  activeTo: string | null;
}

type LiteralValue = string | number | boolean | null;

function extractLiteral(node: t.Node): LiteralValue | undefined {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;
  return undefined;
}

function extractStringArray(node: t.Node): string[] | undefined {
  if (!t.isArrayExpression(node)) return undefined;
  const result: string[] = [];
  for (const el of node.elements) {
    if (!el) return undefined;
    if (!t.isStringLiteral(el)) return undefined;
    result.push(el.value);
  }
  return result;
}

function extractObjectFields(
  node: t.ObjectExpression,
): Record<string, t.Node> {
  const fields: Record<string, t.Node> = {};
  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : undefined;
    if (key !== undefined) {
      fields[key] = prop.value;
    }
  }
  return fields;
}

// Find the first ObjectExpression argument passed to a defineChart(...) call.
function findDefineChartArg(ast: t.File): t.ObjectExpression | null {
  let found: t.ObjectExpression | null = null;

  traverse(ast, {
    CallExpression(path) {
      if (found) return;

      const callee = path.node.callee;
      let isDefineChart = false;

      if (t.isIdentifier(callee) && callee.name === 'defineChart') {
        isDefineChart = true;
      } else if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        callee.property.name === 'defineChart'
      ) {
        isDefineChart = true;
      }

      if (!isDefineChart) return;

      const firstArg = path.node.arguments[0];
      if (firstArg && t.isObjectExpression(firstArg)) {
        found = firstArg;
      }
    },
  });

  return found;
}

export async function scanFile(filePath: string): Promise<ScannedChart | null> {
  const source = await fs.readFile(filePath, 'utf8');

  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  const argNode = findDefineChartArg(ast);
  if (!argNode) return null;

  const fields = extractObjectFields(argNode);

  const id = fields['id'] ? extractLiteral(fields['id']) : undefined;
  const topic = fields['topic'] ? extractLiteral(fields['topic']) : undefined;
  const title = fields['title'] ? extractLiteral(fields['title']) : undefined;
  const description = fields['description']
    ? extractLiteral(fields['description'])
    : undefined;
  const orderRaw = fields['order'] ? extractLiteral(fields['order']) : undefined;
  const activeFrom = fields['activeFrom']
    ? extractLiteral(fields['activeFrom'])
    : undefined;
  const activeTo = fields['activeTo']
    ? extractLiteral(fields['activeTo'])
    : undefined;

  // Required fields
  if (
    typeof id !== 'string' ||
    typeof topic !== 'string' ||
    typeof title !== 'string' ||
    typeof activeFrom !== 'string'
  ) {
    return null;
  }

  const relatedNode = fields['related'];
  const related = relatedNode ? (extractStringArray(relatedNode) ?? []) : [];

  const order =
    typeof orderRaw === 'number' ? orderRaw : undefined;

  const activeToParsed: string | null =
    typeof activeTo === 'string' ? activeTo : null;

  return {
    id,
    topic,
    title,
    description: typeof description === 'string' ? description : '',
    related,
    order,
    activeFrom,
    activeTo: activeToParsed,
  };
}
