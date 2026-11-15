import { render } from "preact";

import "../ui/styles.css";
import "./popup.css";

import { Popup } from "./Popup";

const root = document.getElementById("app");
if (root) render(<Popup />, root);
