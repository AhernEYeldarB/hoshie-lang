import { AdditiveExpression, ArrayExpression, ArrowBody, ArrowParamater, DataExpression, EqualityExpression, FunctionCallExpression, IdentifierExpression, LogicalExpression, MultiplicativeExpression, NotExpression, NumericExpression, RelationalExpression, StringExpression, UnaryMinusExpression } from "../cst/expression";
import { CountFunction, FilterFunction, FirstNFunction, GenerateFunction, GroupCountFunction, GroupFunction, LengthFunction, PipelineFunction, RandomFunction, ReadJsonFunction, SortFunction, WriteJsonFunction } from "../cst/function";
import { HLScope, resolveRef } from "../cst/scope";
import { HLFileScope } from "../cst/scopes/file";
import { HLFunctionScope } from "../cst/scopes/function";
import { RowType } from "../cst/types";

type Declaration = { [id: string]: string };
type FileContent = { [path: string]: { declarations: Declaration, actions: string[] } };

class JSWriter {
    fileContent: FileContent = {};
    hasOutput: boolean = false;

    append(line: string, path: string) {
        if (!this.fileContent[path]) {
            this.fileContent[path] = { declarations: {}, actions: [] };
        }
        this.fileContent[path].actions.push(line);
    }

    outputDecl(path: string) {
        const retVal: string[] = [];
        for (const decl in this.fileContent[path].declarations) {
            retVal.push(`const ${decl} = ${this.fileContent[path].declarations[decl]};`);
        }
        return retVal.join("\n");
    }

    outputBuffer(path: string) {
        return this.fileContent[path].actions.join("\n");
    }

    output() {
        const retVal: string[] = [];
        for (const hoPath in this.fileContent) {
            this.hasOutput = true;
            // const outPath = hoPath.split(".");
            // outPath.pop();
            // outPath.push("js");
            // const jsPath = path.join("out-js", outPath.join("."));
            // const jsPath = outPath(hoPath);
            // retVal.push(`// ${jsPath}`);
            const content = `\
/* eslint-disable */
const df = require("@hpcc-js/dataflow");

${this.outputDecl(hoPath)}

${this.outputBuffer(hoPath)}
`;
            // fs.mkdirSync(path.dirname(jsPath), { recursive: true });
            // fs.writeFileSync(jsPath, content);
            retVal.push(content);
        }
        return retVal.join("\n");
    }

    generate(row: any) {
        if (typeof row === "string") {
            // debugger;
            return row;
        } else if (typeof row === "undefined") {
            return "//  generate(undefined)";
        } else if (this[row?.constructor?.name]) {
            return this[row.constructor.name](row);
        }
        return `todo("${row?.constructor?.name}")`;
    }

    writeAction(row: any) {
        const text = this.generate(row);
        const ref = resolveRef(row);
        if (text !== undefined) {
            if (ref?.func instanceof PipelineFunction) {
                this.append(`JSON.stringify([...${text}], undefined, 2);`, row.scope.path);
            } else if (row instanceof WriteJsonFunction) {
                this.append(`${text};`, row.scope.path);
            } else if (ref?.isActivity) {
                this.append(`JSON.stringify(${text}.peek(), undefined, 2);`, row.scope.path);
            } else if (ref?.isSensor) {
                this.append(`JSON.stringify(${text}.peek(), undefined, 2);`, row.scope.path);
            } else if (ref.type === "data" || ref.type?.indexOf("[]") >= 0) {
                this.append(`JSON.stringify(${text}, undefined, 2);`, row.scope.path);
            } else {
                this.append(`${text};`, row.scope.path);
            }
            return true;
        }
        console.log(`Unhandled type:  ${row?.constructor?.name}`);
        return false;
    }

    writeDecl(id: string, ref: any, scope: HLScope) {
        if (scope instanceof HLFunctionScope) {
            // debugger;
        }
        if (!this.fileContent[scope.path]) {
            this.fileContent[scope.path] = { declarations: {}, actions: [] };
        }
        if (!this.fileContent[scope.path].declarations[id]) {
            this.fileContent[scope.path].declarations[id] = this.generate(ref);
        }
    }

    IdentifierExpression(row: IdentifierExpression) {
        if (row.scope instanceof HLFileScope) {
            this.writeDecl(row.id, row.ref, row.scope);
        }
        return `${row.id}`;
    }

    BooleanExpression(row: NumericExpression) {
        return `${row.value}`;
    }

    NumericExpression(row: NumericExpression) {
        return `${row.value}`;
    }

    StringExpression(row: StringExpression) {
        return `"${row.value}"`;
    }

    NotExpression(row: NotExpression) {
        return `!${this.generate(row.expression)}`;
    }

    UnaryMinusExpression(row: UnaryMinusExpression) {
        return `-${this.generate(row.expression)}`;
    }

    DataExpression(row: DataExpression) {
        const fields = row.fields.map((exp, i) => {
            const id = row.rowType?.fields[i]?.id || i;
            return `${id}: ${this.generate(exp)}`;
        });
        return `{ ${fields.join(", ")} }`;
    }

    ArrayExpression(row: ArrayExpression) {
        const fields = row.values.map((exp, i) => {
            if (exp instanceof DataExpression && row.rowType?.rowType) {
                exp.typeInfo(row.rowType?.rowType as RowType);
            }
            return `${this.generate(exp)}`;
        });
        return `[ ${fields.join(", ")} ]`;
    }

    AdditiveExpression(row: AdditiveExpression) {
        return `${this.generate(row.lhs)} ${row.action} ${this.generate(row.rhs)}`;
    }

    MultiplicativeExpression(row: MultiplicativeExpression) {
        return `${this.generate(row.lhs)} ${row.multiplicative} ${this.generate(row.rhs)}`;
    }

    RelationalExpression(row: RelationalExpression) {
        return `${this.generate(row.lhs)} ${row.action} ${this.generate(row.rhs)}`;
    }

    LogicalExpression(row: LogicalExpression) {
        return `${this.generate(row.lhs)} ${row.action} ${this.generate(row.rhs)}`;
    }

    EqualityExpression(row: EqualityExpression) {
        return `${this.generate(row.lhs)} ${row.action} ${this.generate(row.rhs)}`;
    }

    FunctionCallExpression(row: FunctionCallExpression) {
        this.writeDecl(row.id, row.func, row.scope);
        row.args.forEach(arg => this.generate(arg));
        return `${row.id}(${row.args.map(arg => {
            return arg?.ctx.getText() || "undefined";
        }).join(", ")})`;
    }

    HLFunctionScope(row: HLFunctionScope) {

        const defaults = [];
        row.params.forEach(param => {
            this.generate(param);
            if (param.defaultExpression()) {
                defaults.push(`${param.id} = ${param.id} !== undefined ? ${param.id} : ${this.generate(param.defaultExpression())};`);
            }
        });

        return `(${row.params.map(param => param.id).join(", ")}) => {
${defaults.join("\n")}${defaults.length ? "\n" : ""}\
${this.generate(row.body)}
}`;
    }

    ArrowParamaterXXX(row: ArrowParamater) {
    }

    ArrowBody(row: ArrowBody) {
        return `\
${row.items?.map(item => this.generate(item)).join(";\n")}${row.items?.length ? ";\n" : ""}\
${row.returnExpression ? "return" : ""} ${this.generate(row.returnExpression)};`;
    }

    Declaration(row: Declaration) {
        return `${row.id} = ${this.generate(row.expression)}`;
    }

    GenerateFunction(row: GenerateFunction) {
        return `df.generate(${this.generate(row.expression)}, ${this.generate(row.total)})`;
    }

    RandomFunction(row: RandomFunction) {
        return "TODO"; //`Math(${this.generate(row.expression)}, ${this.generate(row.total)})`;
    }

    PipelineFunction(row: PipelineFunction) {
        return `df.pipe(${row.items.map(item => {
            const retVal = this.generate(item);
            const ref = resolveRef(item);
            if (ref?.isSensor) {
                return `df.sensor(${retVal})`;
            }
            return retVal;
        }).join(", ")})`;
    }

    LengthFunction(row: LengthFunction) {
        const ref = resolveRef(row.expression);
        return `${(row.expression as any).ctx.getText()}.length`;
    }

    FilterFunction(row: FilterFunction) {
        return `df.filter(${this.generate(row.expression)})`;
    }

    FirstNFunction(row: FirstNFunction) {
        return `df.first(${row.count})`;
    }

    SkipNFunction(row: FirstNFunction) {
        return `df.skip(${row.count})`;
    }

    GroupFunction(row: GroupFunction) {
        return `df.group(${this.generate(row.expression)})`;
    }

    GroupCountFunction(row: GroupCountFunction) {
        return `df.pipe(df.group(${this.generate(row.expression)}), df.map(row => ({key: row.key, value: row.value.length})))`;
    }

    SortFunction(row: SortFunction) {
        return `df.sort(${this.generate(row.expression)})`;
    }

    MapFunction(row: SortFunction) {
        return `df.map(${this.generate(row.expression)})`;
    }

    CountFunction(row: CountFunction) {
        return "df.count()";
    }

    DeviationFunction(row: CountFunction) {
        return `df.deviation(${this.generate(row.expression)})`;
    }

    DistributionFunction(row: CountFunction) {
        return `df.distribution(${this.generate(row.expression)})`;
    }

    ExtentFunction(row: CountFunction) {
        return `df.extent(${this.generate(row.expression)})`;
    }

    MaxFunction(row: CountFunction) {
        return `df.max(${this.generate(row.expression)})`;
    }

    MeanFunction(row: CountFunction) {
        return `df.mean(${this.generate(row.expression)})`;
    }

    MedianFunction(row: CountFunction) {
        return `df.median(${this.generate(row.expression)})`;
    }

    MinFunction(row: CountFunction) {
        return `df.min(${this.generate(row.expression)})`;
    }

    QuartileFunction(row: CountFunction) {
        return `df.quartile(${this.generate(row.expression)})`;
    }

    VarianceFunction(row: CountFunction) {
        return `df.variance(${this.generate(row.expression)})`;
    }
}

export function generate(text: string ) {
    const hlFile = new HLFileScope("", "", text);
    const jsWriter = new JSWriter();
    hlFile.allActions().forEach(row => {
        jsWriter.writeAction(row);
    });
    return jsWriter.output();
}

(<any>window).generate = generate;