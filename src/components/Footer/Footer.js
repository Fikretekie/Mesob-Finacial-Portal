/*!

=========================================================
* Now UI Dashboard React - v1.5.2
=========================================================

* Product Page: https://www.creative-tim.com/product/now-ui-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/now-ui-dashboard-react/blob/main/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
/*eslint-disable*/
import React from "react";
import { Container } from "reactstrap";
// used for making the prop types of this component
import PropTypes from "prop-types";
// 
function Footer(props) {
  return (
    <footer className={"footer" + (props.default ? " footer-default" : "")}>
      <Container fluid={props.fluid ? true : false}>
        <div
          className="copyright"
          style={{ color: "var(--text-2)" }}
        >
          &copy; {1900 + new Date().getYear()} · Copy right reserved for Meksova ·
          Coded by{" "}
          <a
            href="https://therevolutiontechnologies.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-2)", textDecoration: "underline" }}
          >
            The Revolution Technologies
          </a>
        </div>
      </Container>
    </footer>
  );
}


Footer.propTypes = {
  default: PropTypes.bool,
  fluid: PropTypes.bool,
};

export default Footer;
