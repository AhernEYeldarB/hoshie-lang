import { Observable } from "@hpcc-js/observable-md";
import { LitElement, html } from "lit";
import { ECLEditor } from "@hpcc-js/codemirror";

// Init initial state
const code = `\
//  Short form function
add = (number a, number b) => a + b;

//  Long form function
add2 = (number a, number b) => {
    return a + b;
};

//  Function with locally scoped declarations
add3 = (number a, number b) => {
    tmpA = a;
    tmpB = b;
    tmp = tmpA + tmpB;
    return tmp;
};

add(1, 2);
add2(1, 2);
add3(1, 2);

//  Function with default value support
join = (string a = "Hello", string b = "World") => a + " " + b;

join();
join("Goodbye");
join(, "Earth");
join("Goodbye", "Earth");
`;

// Initialise app
var editor = new ECLEditor()
  .ecl(code)
  .target("editor")
  .render()
  ;

var app = new Observable()
.target("render")
.showValues(true)
.mode("omd")
.text(
  " \n" +
  "``` " +
  "df = require(\"@hpcc-js/dataflow\"); \n"+
  "add = (a, b) => { \n" +
  "  return a + b; \n" +
  "} \n" +
  "add2 = (a, b) => { \n" +
  "  return a + b; \n" +
  "} \n" +
  "add3 = (a, b) => { \n" +
  "  var tmpA = a \n" +
  "  var tmpB = b \n" +
  "  var tmp = tmpA + tmpB \n" +
  "  return tmp \n" +
  "} \n" +
  "join = (a, b) => { \n" +
  "  a = a !== undefined ? a : 'Hello' \n" +
  "  b = b !== undefined ? b : 'World' \n" +
  "  return a + ' ' + b \n" +
  "} \n" +
  "add(1, 2) \n" +
  "add2(1, 2) \n" +
  "add3(1, 2) \n" +
  "join() \n" +
  "join(\"Goodbye\") \n" +
  "join(undefined, 'Earth') \n" +
  "join('Goodbye', 'Earth') \n" +
  "\n" +
  "``` \n"
);

// Utils
const doResize = () => {
  if (app) {
    app
      .resize()
      .lazyRender()
      ;
  }
};

// Components
class ErrorTab extends LitElement {

  constructor() {
    super();  
    this.app = app;
    this._timerInterval = setInterval(() => this.requestUpdate(), 2000);
  }

  render() {
    return html`
    <table>
      ${this.app._errors.map((error) => { return error.severity === "error" ? html`
      <tr>
        <td>${error.name}</td>
        <td>${error.message}</td>
      </tr>
      ` : ""; })}
    </table>
    `;
  }
}
customElements.define("error-tab", ErrorTab);

// Main
doResize();

  // get codemirror content as .ho
  // compile .ho text
  // render the compiled js in obm
