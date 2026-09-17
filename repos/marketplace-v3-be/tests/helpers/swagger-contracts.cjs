'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Compare imported Swagger schemas with the validators actually called by route
// handlers. Inline and factory-built schemas are covered by the route inventory.
function importedRequestContracts(root) {
  const contracts = [];
  const modules = path.join(root, 'src/modules');
  for (const dir of fs.readdirSync(modules, { withFileTypes: true }).filter(d => d.isDirectory())) {
    for (const name of fs.readdirSync(path.join(modules, dir.name)).filter(n => n.endsWith('.routes.ts'))) {
      const file = path.join(modules, dir.name, name);
      const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const imports = new Map();
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) continue;
        const source = node.moduleSpecifier.text;
        if (!source.startsWith('.')) continue;
        const modulePath = path.resolve(path.dirname(file), source).replace(`${path.sep}src${path.sep}`, `${path.sep}dist${path.sep}`);
        for (const specifier of node.importClause.namedBindings.elements) {
          imports.set(specifier.name.text, { modulePath, name: (specifier.propertyName || specifier.name).text });
        }
      }
      function resolve(name) {
        const reference = imports.get(name);
        return reference && require(reference.modulePath)[reference.name];
      }
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
            ['get', 'post', 'patch', 'put', 'delete'].includes(node.expression.name.text) &&
            node.arguments.length >= 3 && ts.isObjectLiteralExpression(node.arguments[1])) {
          const property = node.arguments[1].properties.find(p => p.name?.getText(ast) === 'schema');
          const schemaName = property?.initializer?.getText(ast);
          const schema = resolve(schemaName);
          if (schema) {
            function inspect(handler) {
              if (ts.isCallExpression(handler) && ts.isPropertyAccessExpression(handler.expression) &&
                  handler.expression.name.text === 'parse' && handler.arguments[0]) {
                let argument = handler.arguments[0];
                while (ts.isParenthesizedExpression(argument) || ts.isAsExpression(argument) || ts.isTypeAssertionExpression(argument) ||
                       (ts.isBinaryExpression(argument) && argument.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
                  argument = ts.isBinaryExpression(argument) ? argument.left : argument.expression;
                }
                const input = argument.getText(ast);
                const section = input.endsWith('.body') ? 'body' : input.endsWith('.query') ? 'querystring' : input.endsWith('.params') ? 'params' : undefined;
                const validator = resolve(handler.expression.expression.getText(ast));
                if (section && validator) contracts.push({ file, schemaName, schema: schema[section], validator, section });
              }
              ts.forEachChild(handler, inspect);
            }
            inspect(node.arguments[2]);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  return contracts;
}
module.exports = { importedRequestContracts };
