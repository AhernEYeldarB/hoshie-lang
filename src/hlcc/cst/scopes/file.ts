import * as fs from "fs";
import * as path from "path";
import { parse } from "../../parser";
import { HLError, removeQuotes } from "../node";
import { Range, resolveRef } from "../scope";
import { HLAction, Test } from "../action";
import { HLStringScope } from "./string";
import { posix } from "../../../utils";
import { CountFunction, DeviationFunction, DistributionFunction, ExtentFunction, FilterFunction, FirstNFunction, GenerateFunction, GroupCountFunction, GroupFunction, LengthFunction, MapFunction, MaxFunction, MeanFunction, MedianFunction, MinFunction, PipelineFunction, QuartileFunction, RandomFunction, ReadJsonFunction, ReduceFunction, SkipNFunction, SortFunction, VarianceFunction, WriteJsonFunction } from "../function";
import { HLParser } from "../../grammar/HLParser";
import { HLParserVisitor } from "../../grammar/HLParserVisitor";

export interface ImportedHLFile extends Range {
    file: HLFileScope;
}

export class HLFileScope extends HLStringScope {
    readonly importedFiles: ImportedHLFile[] = [];

    constructor(readonly label: string, readonly path: string, readonly text?: string) {
        super(label, path, text);
        if (!text) {
            text = fs.readFileSync(path, { encoding: "utf8" });
        }

        this._parsed = parse(text);
        if (this._parsed.full) {
            try {
                this.visitProgram(this._parsed.tree);
            } catch (e) {
                if (!this._parsed.lexErrors.length && !this._parsed.parseErrors.length) {
                    //  Unexpected visitor error...
                    console.error(e);
                }
            }
        }
    }

    // Getter overrides ---
    allErrors(): HLError[] {
        let retVal = this.errors();
        this.importedFiles.forEach(i => {
            retVal = retVal.concat(i.file.allErrors());
        });
        return retVal;
    }

    allActions(): HLAction[] {
        let retVal = this.actions();
        this.importedFiles.forEach(i => {
            retVal = retVal.concat(i.file.allActions());
        });
        return retVal;
    }

    allTests(): Test[] {
        let retVal = this.tests();
        this.importedFiles.forEach(i => {
            retVal = retVal.concat(i.file.allTests());
        });
        return retVal;
    }
    
    visitImportFrom(ctx) {
        const [] = HLParser.prototype.visitImportFrom(ctx);
        const [, impStr] = ctx.children;
        const str = removeQuotes(impStr.getText());
        const importFilePath = posix(path.join(path.dirname(this.path), str + ".ho"));
        if (!fs.existsSync(importFilePath)) {
            this.tokError(impStr, "Invalid file path");
        } else {
            //  TODO - Create Pool so File doesn't get parsed multiple times.
            const importHLFile = new HLFileScope(str, importFilePath);
            this.importedFiles.push({
                line: impStr.symbol.line,
                column: impStr.symbol.column,
                length: impStr.symbol.stop - impStr.symbol.start + 1,
                file: importHLFile
            });
            return importHLFile;
        }
        return undefined;
    }

    visitKeywordCallExpression(ctx): ReadJsonFunction | WriteJsonFunction | CountFunction | DeviationFunction | DistributionFunction | ExtentFunction | FilterFunction | FirstNFunction | GenerateFunction | GroupCountFunction | GroupFunction | LengthFunction | MapFunction | MaxFunction | MeanFunction | MedianFunction | MinFunction | PipelineFunction | QuartileFunction | RandomFunction | ReduceFunction | SkipNFunction | SortFunction | VarianceFunction {
        const children = HLParserVisitor.prototype.visitKeywordCallExpression(ctx);
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
        } else if (keyword.ReadJson()) {
            switch (params.length) {
                case 1:
                    const ref = resolveRef(params[0]);
                    if (ref?.type !== "string") {
                        this.ctxError(ctx, "Expression should resolve to a string");
                    }
                    const relFilePath = posix(path.join(path.dirname(this.path), ref?.value));
                    if (!fs.existsSync(relFilePath)) {
                        this.ctxError(ctx, "Invalid file path");
                    }
                    return new ReadJsonFunction(ctx, this, params[0]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 1.");
            }
        } else if (keyword.WriteJson()) {
            switch (params.length) {
                case 2:
                    const ref = resolveRef(params[1]);
                    if (ref?.type !== "string") {
                        this.ctxError(ctx, "Second paramater should be a string");
                    }
                    return new WriteJsonFunction(ctx, this, params[0], params[1]);
                default:
                    this.ctxError(ctx, "Invalid number of paramaters, expected 2.");
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