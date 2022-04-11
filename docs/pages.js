import { Observable } from "@hpcc-js/observable-md";
import { LitElement, html } from "lit";
import { ECLEditor } from "@hpcc-js/codemirror";
const generate = window.generate;

// Init initial state
const code = `\
Person = {
  string fname,
  string lname,
  number age,
  string job,
  string zipcode,
  string state
};

data = [
{
  "Santiago",
  "Kuvalis",
  36,
  "Designer",
  "20522-7262",
  "MA"
},
{
  "Cornelius",
  "Hyatt",
  58,
  "Engineer",
  "97368-0001",
  "MT"
},
{
  "Gino",
  "Blanda",
  35,
  "Facilitator",
  "36178-3400",
  "ND"
},
{
  "Kameron",
  "Huel",
  60,
  "Engineer",
  "88002-1751",
  "TX"
}
] typeof Person[];

sortByAge = pipeline(sort((Person l, Person r) => l.age - r.age));
sortByAge(data);
`;

// Utils
const doResize = () => {
  if (app) {
    app
      .resize()
      .lazyRender()
      ;
  }
};

const convertToObservablemdString = (text) => {
  return text.replaceAll(/const /g, "");
};

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
    `${convertToObservablemdString(generate(code))}` +
    "``` \n"
  );

editor._codemirror.on("change", (editor) => {
  const observablemdJs = convertToObservablemdString(generate(editor.getValue()));
  const textToRender = "" +
    "``` \n" +
    `${observablemdJs} \n` +
    "```";
  app._text = textToRender;
  app._lazyRender();
});

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
      ${this.app._errors.map((error) => {
      return error.severity === "error" ? html`
      <tr>
        <td>${error.name}</td>
        <td>${error.message}</td>
      </tr>
      ` : "";
    })}
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
