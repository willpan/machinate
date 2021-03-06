import React from "react";
import PropTypes from "prop-types";
import createGraph from "./graph";

import DomainState from "./components/DomainState";

const isTransitionable = (scheme, currentState, toState) => {
  const [toDomainName] = toState.split(".");

  const domainInfo = scheme[toDomainName];
  if (!domainInfo.deps) return true;

  const deps = Object.keys(domainInfo.deps);
  return deps.every(dep => {
    const [domainName, stateName] = dep.split(".");
    return Boolean(
      currentState[domainName] && currentState[domainName].state === stateName
    );
  });
};

const createMachine = function(schema, state) {
  let components = [];

  // TODO: throw if scheme or initial state is missing

  const depGraph = createGraph(schema);

  // syntax expansions
  schema = Object.entries(schema).reduce((obj, [domainName, value]) => {
    if (Array.isArray(value)) {
      obj[domainName] = { states: value };
    } else {
      obj[domainName] = value;
    }
    return obj;
  }, {});

  state = Object.entries(state).reduce((obj, [domainName, value]) => {
    if (typeof value === "string") {
      obj[domainName] = { state: value };
    } else {
      obj[domainName] = value;
    }
    return obj;
  }, {});

  const getDomainInfo = domainName =>
    domainName ? schema[domainName] : schema;

  const getState = domainName => {
    return JSON.parse(
      JSON.stringify(domainName ? state[domainName] || null : state)
    );
  };

  const setState = nextState => {
    state = nextState;
    _updateAll();
  };

  const transition = (domainName, stateName, payload) => {
    const toName = domainName + "." + stateName;
    const fromName =
      state[domainName] && domainName + "." + state[domainName].state;

    if (!isTransitionable(schema, state, toName)) {
      // is throwing an error too harsh?
      // throw new Error("this state cannot be transitioned to.")
      return;
    }

    // console.log(
    //   "going from",
    //   fromName,
    //   "to",
    //   toName,
    //   depGraph.getDependents(state, fromName).map(n => n.f),
    //   depGraph.getDependents(state, toName).map(n => n.f)
    // );

    state[domainName] = {
      state: stateName,
      data: payload
    };

    // cmon dude, do it immutably
    depGraph
      .getDependents(state, fromName)
      .map(n => n.f)
      .forEach(domain => {
        delete state[domain];
      });

    depGraph.getDependents(state, toName).forEach(node => {
      if (node.ts[0].name) {
        transition(node.f, node.ts[0].name);
      }
    });

    _updateAll();
  };

  const _updateAll = () => {
    // - is there a better, more efficient way to do this?
    // - is this idiomatic react? should I just setState() on sub-components?
    components.forEach(comp => comp.forceUpdate());
  };

  const go = (notation, payload) => _ => {
    const [domainName, stateName] = notation.split(".");
    transition(domainName, stateName, payload);
  };

  const componentForDomain = domainName => {
    const generatedPropTypes = Object.values(
      getDomainInfo(domainName).states || {}
    ).reduce((obj, stateName) => {
      obj[stateName] = PropTypes.func.isRequired;
      return obj;
    }, {});

    const Wrapper = props => (
      <DomainState
        _config={{
          onAdd: ref => components.push(ref),
          onRemove: ref =>
            (components = components.filter(comp => comp !== ref)),
          domainName,
          machine: { transition, go, getState }
        }}
        {...props}
      />
    );
    Wrapper.displayName = domainName + "[Domain]";
    Wrapper.propTypes = generatedPropTypes;

    return Wrapper;
  };

  return {
    getState,
    setState,
    transition,

    getDomainInfo,
    componentForDomain,
    getComponents: () => components
  };
};

export { createMachine, isTransitionable };
