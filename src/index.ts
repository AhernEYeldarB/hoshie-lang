#!/usr/bin/env node

import * as yargs from "yargs";
import { HLFileScope } from "./hlcc/cst/scopes/file";
import { generate, outPath } from "./hlcc/codeGen/js";
import * as childProcess from "child_process";
import { fstat, existsSync, unlinkSync } from "fs";

function runScript(scriptPath, callback) {

    // keep track of whether callback has been invoked to prevent multiple invocations
    let invoked = false;

    const process = childProcess.fork(scriptPath);

    // listen for errors as they may prevent the exit event from firing
    process.on("error", function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });

    // execute the callback once the process has finished running
    process.on("exit", function (code) {
        if (invoked) return;
        invoked = true;
        const err = code === 0 ? null : new Error("exit code " + code);
        callback(err);
    });

}

const argv = yargs
    .scriptName("hlcc")
    .command("check <file>", "Syntax check file")
    .command("compile <file>", "Execute file")
    .command("run <file>", "Execute file")
    .command("test <file>", "Unit test file")
    .help()
    .argv
    // .option("s", { alias: "syntax", describe: "Check Syntax", type: "boolean", demandOption: false })
    ;
// yargs.showHelp();
const [cmd] = argv._ || [];
let hlFile;

function logErrors(hFile: HLFileScope) {
    hlFile.allErrors().forEach(row => {
        console.log(`${row.source}:${row.line}:${row.column} - ${row.severity} HO${row.code}: ${row.message}`);
    });
}

function cleanExistingFile(filePath: string) {
    if(!existsSync(filePath)) return;
    unlinkSync(filePath);
}

switch (cmd) {
    case "check":
        console.log(`Syntax checking "${argv.file}"\n`);
        hlFile = new HLFileScope("", argv.file);
        logErrors(hlFile);
        break;
    case "compile":
        console.log(`Compiling "${argv.file}"\n`);
        hlFile = new HLFileScope("", argv.file);
        logErrors(hlFile);
        generate(hlFile);
        break;
    case "run":
        console.log(`Compiling "${argv.file}"`);
        hlFile = new HLFileScope("", argv.file);
        logErrors(hlFile);
        console.log(`Compiled "${argv.file}"`);
        generate(hlFile);
        const filePath = outPath(argv.file);
        if (!!!hlFile.text) { 
            cleanExistingFile(filePath);
            break;
        }
        console.log(`Running "${argv.file}"\n`);
        runScript(filePath, function (err) {
            if (err) throw err;
            console.log(`\nFinished "${argv.file}"`);
        });
        break;
    case "test":
        console.log(`Testing "${argv.file}"\n`);
        hlFile = new HLFileScope("", argv.file);
        hlFile.allErrors().forEach(row => {
            console.log(`${row.source}:${row.line}:${row.column} - ${row.severity} HO${row.code}: ${row.message}`);
        });
        const results = hlFile.allTests().map(row => row.test());
        console.log(results.join(""));
        break;
    default:
        yargs.showHelp();
        console.error(`\nInvalid command "${cmd}", expected "check | run | rest"`);
}
//     default:
// }
/*

if (argv.syntax) {
    console.log(`Checking Syntax:  ${argv._}`);
    fs.readFile(inFiles[0], "utf8", (err, data) => {
        if (err) {
            console.error(err.message);
        } else {
        }
    });
} else {
    console.log(`Compiling:  ${argv._}`);
    fs.readFile(inFiles[0], "utf8", (err, data) => {
        if (err) {
            console.error(err.message);
        } else {
        }
    });
}

*/