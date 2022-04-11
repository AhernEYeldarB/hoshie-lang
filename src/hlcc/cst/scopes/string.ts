import { parse, ParseResponse } from "../../parser";
import { hlError, HLError } from "../node";
import { HLDeclaration } from "../declaration";
import { HLScope } from "../scope";
import { HLFunctionScope } from "./function";
import { HLAction, Test } from "../action";
import { TypeDeclaration } from "../types";

export class HLStringScope extends HLScope {

    protected _parsed: ParseResponse;

    readonly exports: { [id: string]: HLDeclaration | TypeDeclaration } = {};

    constructor(readonly label: string, readonly path: string, readonly text?: string) {
        super(label, path, text);

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

    resolveScope(line: number, column: number) {
        for (const key in this.declarations) {
            const decl = this.declarations[key];
            if (decl.expression instanceof HLFunctionScope && decl.expression.contains(line, column)) {
                return decl.expression;
            }
        }
        return this;
    }

    errors(): HLError[] {
        return [
            ...this._parsed.lexErrors.map(e => hlError(this.path, e)),
            ...this._parsed.parseErrors.map(e => hlError(this.path, e)),
            ...super.errors()
        ];
    }

    allErrors(): HLError[] {
        
        return this.errors();
    }

    allActions(): HLAction[] {
        return this.actions();
    }

    allTests(): Test[] {
        return this.tests();
    }

    //  Visitor overrides  ---
    visitModuleItems(ctx) {
        const retVal = super.visitModuleItems(ctx);
        return retVal.filter(row => !!row);
    }

    visitImportDeclaration(ctx): { identifier: string, as: string, ctx } {
        const [id, , idAs] = ctx.children;

        const identifier = id.getText?.() || id.identifier().getText();
        const as = idAs?.identifier().getText();

        return { identifier, as, ctx };
    }

    visitExportDeclaration(ctx) {
        const retVal = super.visitExportDeclaration(ctx);
        const [, hlVar] = retVal;
        this.exports[hlVar.id] = hlVar;
        return retVal;
    }

    visitArrowFunctionExpression(ctx) {
        const f = new HLFunctionScope(this.path, ctx, this);
        return f;
    }
}