import * as path from "path";
import * as fs from "fs";
import { HLFileScope } from "../cst/scopes/file";
import { JSWriter } from "./jsWriter";
import { IdentifierExpression } from "../cst/expression";
import { resolveRef } from "../cst/scope";
import { WriteJsonFunction } from "../cst/function";

export function outPath(inPath: string): string {
    const outPath = inPath.split(".");
    outPath.pop();
    outPath.push("js");
    return path.join("out-js", outPath.join("."));
}

class JSWriterFile extends JSWriter {
    constructor() {
        super();
    }

    IdentifierExpression(row: IdentifierExpression) {
        if (row.scope instanceof HLFileScope) {
            this.writeDecl(row.id, row.ref, row.scope);
        }
        return `${row.id}`;
    }

    output() {
        const retVal: string[] = [];
        for (const hoPath in this.fileContent) {
            this.hasOutput = true;
            const jsPath = outPath(hoPath);
            retVal.push(`// ${jsPath}`);
            const content = `\
/* eslint-disable */
const df = require("@hpcc-js/dataflow");
const fs = require("fs");

${this.outputDecl(hoPath)}

${this.outputBuffer(hoPath)}
`;
            fs.mkdirSync(path.dirname(jsPath), { recursive: true });
            fs.writeFileSync(jsPath, content);
            retVal.push(content);
        }
        return retVal.join("\n");
    }

    writeAction(row: any) {
        const text = this.generate(row);
        const ref = resolveRef(row);
        if (text !== undefined) {
            if (ref?.func instanceof this.PipelineFunction) {
                this.append(`console.log(JSON.stringify([...${text}], undefined, 2));`, row.scope.path);
            } else if (row instanceof WriteJsonFunction) {
                this.append(`${text};`, row.scope.path);
            } else if (ref?.isActivity) {
                this.append(`console.log(JSON.stringify(${text}.peek(), undefined, 2));`, row.scope.path);
            } else if (ref?.isSensor) {
                this.append(`console.log(JSON.stringify(${text}.peek(), undefined, 2));`, row.scope.path);
            } else if (ref.type === "data" || ref.type?.indexOf("[]") >= 0) {
                this.append(`console.log(JSON.stringify(${text}, undefined, 2));`, row.scope.path);
            } else {
                this.append(`console.log(${text});`, row.scope.path);
            }
            return true;
        }
        console.log(`Unhandled type:  ${row?.constructor?.name}`);
        return false;
    }
}

export function generate(hlFile: HLFileScope) {
    const jsWriter = new JSWriterFile();
    if (fs.existsSync(outPath(hlFile.path))) {
        fs.unlinkSync(outPath(hlFile.path));
    }
    hlFile.allActions().forEach(row => {
        jsWriter.writeAction(row);
    });
    jsWriter.output();
}
