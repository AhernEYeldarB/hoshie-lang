import * as fs from "fs";
import * as path from "path";
import { parse } from "../../parser";
import { HLError, removeQuotes } from "../node";
import { Range } from "../scope";
import { HLAction, Test } from "../action";
import { HLStringScope } from "./string";
import { posix } from "../../../utils";

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
        const [] = super.visitImportFrom(ctx);
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
}