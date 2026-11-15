import { render } from "preact";

import "../ui/styles.css";
import "./options.css";

import { Options } from "./Options";

const root = document.getElementById("app");
if (root) render(<Options />, root);
