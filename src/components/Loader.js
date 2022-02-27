import React from "react";

function Loader({ text = "Loading..." }) {
  return (
    <div className="loader">
      <div class="spinner-border" role="status">
        <span class="visually-hidden"></span>
      </div>
      <br />
      <div>{text}</div>
    </div>
  );
}

export default Loader;
