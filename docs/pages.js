import { Observable } from "@hpcc-js/observable-md";
// import { LitElement, html } from "lit";
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
.text("")
;

// Utils
const doResize = () => {
  if (app) {
    app
      .resize()
      .lazyRender()
      ;
  }
};

// Main
doResize();

  // get codemirror content as .ho
  // compile .ho text
  // render the compiled js in obm