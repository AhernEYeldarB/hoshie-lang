import { HLError, HLNode, removeQuotes } from "./node";
import { Declaration, HLDeclaration } from "./declaration";
import { AdditiveExpression, ArrayExpression, BooleanExpression, EqualityExpression, IdentifierExpression, LogicalExpression, MultiplicativeExpression, NotExpression, NumericExpression, RelationalExpression, StringExpression, FunctionCallExpression, DataExpression, UnaryMinusExpression } from "./expression";
import { HLAction, Test } from "./action";
import { CountFunction, DeviationFunction, DistributionFunction, ExtentFunction, FilterFunction, FirstNFunction, GenerateFunction, GroupCountFunction, GroupFunction, LengthFunction, MapFunction, MaxFunction, MeanFunction, MedianFunction, MinFunction, PipelineFunction, QuartileFunction, RandomFunction, ReadJsonFunction, ReduceFunction, SkipNFunction, SortFunction, VarianceFunction, WriteJsonFunction } from "./function";
import { HLParserVisitor } from "../grammar/HLParserVisitor";
import { ArrayType, BooleanType, NumberType, RowType, StringType, TypeDeclaration } from "./types";

export interface Range {
    line: number,
    column: number,
    length: number
}

export function resolveRef(refIn) {
    let ref = refIn;
    while (ref?.ref) {
        ref = ref.ref;
    }
    return ref;
}

const isChildToken = (item: any) => typeof item === "string";

export class HLScope extends HLParserVisitor {

    private _errors: HLError[] = [];
    private _actions: HLAction[] = [];
    private _tests: Test[] = [];

    readonly types: { [id: string]: TypeDeclaration } = {};
    readonly declarations: { [id: string]: HLDeclaration } = {};

    constructor(readonly label: string, readonly path: string, readonly text?: string) {
        super();
    }

    appendError(node: HLNode, message: string, source: string = "src/hlcc/file.ts") {
        this._errors.push({
            ...node.createError(source, message),
            filePath: this.path
        });
    }

    ctxError(ctx, message: string, source: string = "src/hlcc/file.ts") {
        let length = ctx.stop.stop - ctx.start.start + 1;
        if (length < 0) {
            length = 0;
        }
        this._errors.push({
            column: ctx.start.column,
            line: ctx.start.line,
            length,
            filePath: this.path,
            source,
            message
        });
    }

    tokError(tok, message: string, source: string = "src/hlcc/file.ts") {
        let length = tok.symbol.stop - tok.symbol.start + 1;
        if (length < 0) {
            length = 0;
        }
        this._errors.push({
            column: tok.symbol.column,
            line: tok.symbol.line,
            length,
            filePath: this.path,
            source,
            message
        });
    }

    declarationErrors(): HLError[] {
        let retVal: HLError[] = [];
        for (const key in this.declarations) {
            if (this.declarations[key]?.expression?.errors) {
                retVal = [...retVal, ...this.declarations[key].expression.errors()];
            }
        }
        return retVal;
    }

    errors(): HLError[] {
        return [
            ...this.declarationErrors(),
            ...this._errors
        ];
    }

    actions(): HLAction[] {
        return this._actions;
    }

    hasAction(): boolean {
        return this._actions.length > 0;
    }

    hasError(): boolean {
        return this._errors.length > 0;
    }

    tests(): Test[] {
        return this._tests;
    }

    declaration(id: string): HLDeclaration | undefined {
        const retVal = this.declarations[id];
        return retVal;
    }

    resolve(id: string): HLDeclaration | undefined {
        const idParts = id.split(".");
        let retVal: any = this;
        let partID = idParts.shift();
        while (partID) {
            retVal = retVal?.declaration(partID);
            partID = idParts.shift();
        }
        return retVal;
    }

    appendDeclaration(ctx, id: string, decl: HLDeclaration) {
        if (this.declarations[id]) {
            this.ctxError(ctx, `Duplicate Symbol "${id}"`);
        } else {
            this.declarations[id] = decl;
        }
    }

    resolveType(id: string): TypeDeclaration | undefined {
        const retVal = this.types[id];
        return retVal;
    }

    appendType(ctx, id: string, decl: TypeDeclaration) {
        if (this.types[id]) {
            this.ctxError(ctx, `Duplicate Type "${id}"`);
        } else {
            this.types[id] = decl;
        }
    }

    //  Visitor overrides  ---

    visitTerminal(ctx) {
        return ctx.symbol.text;
    }

    visitProgram(ctx) {
        return super.visitProgram(ctx);
    }

    visitBlock(ctx) {
        return super.visitBlock(ctx);
    }

    visitArguments(ctx) {
        const children = super.visitArguments(ctx);
        return children.filter(child => !isChildToken(child))
            .map(child => Array.isArray(child) ? child[0] : child)
            ;
    }

    visitFunctionCallExpression(ctx) {
        const children = super.visitFunctionCallExpression(ctx);
        const [identifier, args] = children;
        const decl = this.resolve(identifier.id);
        if (decl?.type !== "function") {
            this.ctxError(ctx, `${identifier.id} is not a function.`);
        }
        return new FunctionCallExpression(ctx, this, identifier.id, decl?.expression as any, args);
    }

    visitUnaryMinusExpression(ctx) {
        const [, expression] = super.visitUnaryMinusExpression(ctx);
        if (expression.type !== "number") {
            this.ctxError(ctx, "Expression is not number");
        }
        return new UnaryMinusExpression(ctx, this, expression);
    }

    visitNotExpression(ctx) {
        const [, expression] = super.visitNotExpression(ctx);
        if (expression.type !== "boolean") {
            this.ctxError(ctx, "Expression is not boolean");
        }
        return new NotExpression(ctx, this, expression);
    }

    visitMultiplicativeExpression(ctx) {
        const [lhs, , rhs] = super.visitMultiplicativeExpression(ctx);
        if (lhs.type === "number" && rhs.type === "number") {
        } else {
            this.ctxError(ctx, "Multiplicative Expression is not valid");
        }
        return new MultiplicativeExpression(ctx, this, lhs, rhs, !!ctx.Multiply() ? "*" : !!ctx.Divide() ? "/" : !!ctx.Modulus() ? "%" : undefined);
    }

    visitAdditiveExpression(ctx) {
        const [lhs, , rhs] = super.visitAdditiveExpression(ctx);
        if (lhs.type === "number" && rhs.type === "number") {
        } else if (lhs.type === "string" && rhs.type === "string" && !!ctx.Plus()) {
        } else if (lhs.type === "string" && rhs.type === "number" && !!ctx.Plus()) {
        } else {
            this.ctxError(ctx, "Additive Expression is not valid");
        }
        return new AdditiveExpression(ctx, this, lhs, rhs, !!ctx.Plus() ? "+" : "-");
    }

    visitRelationalExpression(ctx) {
        const [, action] = ctx.children;
        const [lhs, , rhs] = super.visitRelationalExpression(ctx);
        if (lhs.type === "boolean" && rhs.type === "boolean" ||
            lhs.type === "number" && rhs.type === "number" ||
            lhs.type === "string" && rhs.type === "string") {
        } else {
            this.ctxError(ctx, "Relational Expression is not valid");
        }
        return new RelationalExpression(ctx, this, lhs, rhs, action.getText());
    }

    visitEqualityExpression(ctx) {
        const [lhs, , rhs] = super.visitEqualityExpression(ctx);
        if (lhs.type === "boolean" && rhs.type === "boolean") {
        } else if (lhs.type === "number" && rhs.type === "number") {
        } else if (lhs.type === "string" && rhs.type === "string") {
        } else {
            this.ctxError(ctx, "Equality Expression is not valid");
        }
        return new EqualityExpression(ctx, this, lhs, rhs, !!ctx.Equals() ? "==" : !!ctx.NotEquals() ? "!=" : undefined);
    }

    visitLogicalExpression(ctx) {
        const [lhs, , rhs] = super.visitLogicalExpression(ctx);
        if (lhs.type === "boolean" && rhs.type === "boolean") {
        } else {
            this.ctxError(ctx, "Logical Expression is not valid");
        }
        return new LogicalExpression(ctx, this, lhs, rhs, !!ctx.And() ? "&&" : !!ctx.Or() ? "||" : undefined);
    }

    visitIdentifierExpression(ctx) {
        const id = ctx.identifier().getText();
        const expression = this.resolve(id)?.expression;
        if (!expression) {
            this.ctxError(ctx, `Invalid identifier "${id}"`);
        }
        return new IdentifierExpression(ctx, this, id, expression);
    }

    visitLiteralExpression(ctx) {
        const children = super.visitLiteralExpression(ctx);
        const [retVal] = children;
        return retVal;
    }

    visitArrayLiteralExpression(ctx) {
        const children = super.visitArrayLiteralExpression(ctx);
        const [Arrayliteral, , arrType] = children;
        const [, literalItems] = Arrayliteral;
        const literals = literalItems === "]" ? [] : literalItems || [];
        literals.forEach(item => {
            if (item.type !== literals[0].type) {
                this.appendError(item, `All items must be type of "${literals[0].type}"`);
            }
        });
        const retVal = new ArrayExpression(ctx, this, literals?.filter(row => !!row));
        retVal.typeInfo(arrType);
        return retVal;
    }

    visitElementList(ctx) {
        const children = super.visitElementList(ctx);
        return children.filter(child => child !== ",");
    }

    visitBooleanLiteralExpression(ctx) {
        return new BooleanExpression(ctx, this, ctx.BooleanLiteral().getText() === "true");
    }

    visitNumberLiteralExpression(ctx) {
        return new NumericExpression(ctx, this, Number(ctx.DecimalLiteral().getText()));
    }

    visitStringLiteralExpression(ctx) {
        return new StringExpression(ctx, this, removeQuotes(ctx.StringLiteral().getText()));
    }

    visitDataLiteralExpression(ctx) {
        const children = super.visitDataLiteralExpression(ctx);
        const [[_, items], , rowType] = children;
        const retVal = new DataExpression(ctx, this, items);
        retVal.typeInfo(rowType);
        return retVal;
    }

    //  Types  ---

    visitTypeStatement(ctx) {
        const [hlVar] = super.visitTypeStatement(ctx);
        return hlVar;
    }

    visitTypeDeclaration(ctx) {
        const [id] = ctx.children;
        const [, rhs] = super.visitTypeDeclaration(ctx);
        const hlVar = new TypeDeclaration(ctx, this, id.getText(), rhs);
        this.appendType(ctx, hlVar.id, hlVar);
        return hlVar;
    }

    visitTypeInitialiser(ctx) {
        const children = super.visitTypeInitialiser(ctx);
        const [, type] = children;
        return type;
    }

    visitBooleanType(ctx) {
        return ctx.OpenBracket() && ctx.CloseBracket() ? new ArrayType(ctx, this, new BooleanType(ctx, this)) : new BooleanType(ctx, this);
    }

    visitNumberType(ctx) {
        return ctx.OpenBracket() && ctx.CloseBracket() ? new ArrayType(ctx, this, new NumberType(ctx, this)) : new NumberType(ctx, this);
    }

    visitStringType(ctx) {
        return ctx.OpenBracket() && ctx.CloseBracket() ? new ArrayType(ctx, this, new StringType(ctx, this)) : new StringType(ctx, this);
    }

    visitRowType(ctx) {
        const children = super.visitRowType(ctx);
        const [fields, openBracket, closeBracket] = children;
        const rowType = new RowType(ctx, this, fields);
        return openBracket && closeBracket ? new ArrayType(ctx, this, rowType) : rowType;
    }

    visitIdentifierType(ctx) {
        const children = super.visitIdentifierType(ctx);
        const [id, openBracket, closeBracket] = children;
        const idType = this.resolveType(id);
        if (!idType) {
            this.ctxError(ctx, `Invalid type "${id}"`);
        }
        return openBracket && closeBracket ? new ArrayType(ctx, this, idType?.type) : idType?.type;
    }

    visitRowTypeDefinition(ctx) {
        const children = super.visitRowTypeDefinition(ctx);
        const [, fields] = children;
        return fields;
    }

    visitFormalFieldTypeList(ctx) {
        const children = super.visitFormalFieldTypeList(ctx);
        return children.filter(child => child !== ",");
    }

    visitFormalFieldType(ctx) {
        const children = super.visitFormalFieldType(ctx);
        const [type, [id]] = children;
        return new TypeDeclaration(ctx, this, id, type);
    }

    //  Declarations  ---

    visitVariableStatement(ctx) {
        const [hlVar] = super.visitVariableStatement(ctx);
        return hlVar;
    }

    visitVariableDeclaration(ctx) {
        const [id] = ctx.children;
        const [, rhs] = super.visitVariableDeclaration(ctx);
        const hlVar = new Declaration(ctx, this, id.getText(), rhs);
        this.appendDeclaration(ctx, hlVar.id, hlVar);
        return hlVar;
    }

    visitVariableInitialiser(ctx) {
        const children = super.visitVariableInitialiser(ctx);
        const [, expression, , asType] = children;
        const exprType = expression?.body?.type || expression?.type;
        switch (exprType) {
            case "data":
                expression.typeInfo && expression.typeInfo(asType?.type);
                break;
            case "data[]":
                if (asType?.type && !(asType?.type instanceof ArrayType)) {
                    this.appendError(expression, "Expected \"typeof\" to be an Array?");
                }
                expression.typeInfo && expression.typeInfo(asType?.type);
                break;
            default:
                if (asType && exprType !== asType.eval()) {
                    this.appendError(expression, `Mismatched types "${expression.type}" typeof "${asType.eval()}"`);
                }
        }
        return expression;
    }

    visitInlineAction(ctx) {
        const children = super.visitInlineAction(ctx);
        const [retVal, _] = children;
        this._actions.push(retVal);
        return retVal;
    }

    visitUnitTest(ctx) {
        const [_0, _1, _2, _3, _4, _5, msg] = ctx.children;
        const children = super.visitUnitTest(ctx);
        const [__0, __1, actual, __3, expected] = children;
        const test = new Test(ctx, this, actual, expected, msg?.getText());
        this._tests.push(test);
        return test;
    }

    visitPipeIdentifierExpression(ctx) {
        return this.visitIdentifierExpression(ctx);
    }

    visitPipekeywordExpression(ctx) {
        return this.visitKeywordCallExpression(ctx);
    }

    //  Keywords  ---
    visitKeywordCallExpression(ctx): ReadJsonFunction | WriteJsonFunction | CountFunction | DeviationFunction | DistributionFunction | ExtentFunction | FilterFunction | FirstNFunction | GenerateFunction | GroupCountFunction | GroupFunction | LengthFunction | MapFunction | MaxFunction | MeanFunction | MedianFunction | MinFunction | PipelineFunction | QuartileFunction | RandomFunction | ReduceFunction | SkipNFunction | SortFunction | VarianceFunction {
        const children = super.visitKeywordCallExpression(ctx);
        const keyword = ctx.keyword();
        const [, params] = children;
        if (keyword.Generate()) {
            switch (params.length) {
                case 2:
                    if (params[0].type && params[1].type === "number") {
                        return new GenerateFunction(ctx, this, params[0], params[1]);
                    } else {
                        this.ctxError(ctx, `Invlid paramters, expected "any, number" got "${params[0].type}, ${params[1].type}".`);
                    }
                    break;
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 2.");
            }
        } else if (keyword.Random()) {
            switch (params.length) {
                case 0:
                    return new RandomFunction(ctx, this);
                case 2:
                    if (params[0].type === "number" && params[1].type === "number") {
                        return new RandomFunction(ctx, this, params[0], params[1]);
                    } else {
                        this.ctxError(ctx, `Invlid paramters, expected "number, number" got "${params[0].type}, ${params[1].type}".`);
                    }
                    break;
                case 3:
                    if (params[0].type === "number" && params[1].type === "number" && params[2].type === "boolean") {
                        return new RandomFunction(ctx, this, params[0], params[1], params[2]);
                    } else {
                        this.ctxError(ctx, `Invlid paramters, expected "number, number, boolean" got "${params[0].type}, ${params[1].type}, ${params[2].type}".`);
                    }
                    break;
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 0, 2 or 3.");
            }
        } else if (keyword.Length()) {
            switch (params.length) {
                case 1:
                    if (!LengthFunction.hasLength(params[0])) {
                        this.ctxError(ctx, "Expression does not have length");
                    }
                    return new LengthFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.Filter()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "boolean") {
                        this.ctxError(ctx, "Expression should resolve to a boolean");
                    }
                    return new FilterFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.FirstN()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.type !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number");
                    }
                    return new FirstNFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.Group()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "boolean" && ref?.returnType !== "number" && ref?.returnType !== "string") {
                        this.ctxError(ctx, "Expression should resolve to a boolean, number or string");
                    }
                    return new GroupFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.GroupCount()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "boolean" && ref?.returnType !== "number" && ref?.returnType !== "string") {
                        this.ctxError(ctx, "Expression should resolve to a boolean, number or string");
                    }
                    return new GroupCountFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.Map()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "data") {
                        this.ctxError(ctx, "Expression should resolve to a data");
                    }
                    return new MapFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.Pipeline()) {
            if (params.length >= 1) {
                return new PipelineFunction(ctx, this, params);
            } else {
                this.ctxError(ctx, "Invalid number of paramaters, expected 1 or more.");
            }
        } else if (keyword.activity()?.SkipN()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.type !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number");
                    }
                    return new SkipNFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.activity()?.Sort()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number (-1, 0, 1)");
                    }
                    return new SortFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Count()) {
            switch (params.length) {
                case 0:
                    return new CountFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 0.");
            }
        } else if (keyword.sensor()?.Deviation()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new DeviationFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Distribution()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new DistributionFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Extent()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new ExtentFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Max()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new MaxFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Mean()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new MeanFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Median()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new MedianFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Min()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new MinFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Quartile()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new QuartileFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Reduce()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new ReduceFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.sensor()?.Variance()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.returnType !== "number") {
                        this.ctxError(ctx, "Expression should resolve to a number.");
                    }
                    return new VarianceFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else {
            this.ctxError(ctx, `Unknown keyword "${keyword.getText()}"`);
        }
    }
}
