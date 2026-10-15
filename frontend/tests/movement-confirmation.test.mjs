import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(
  new URL("../components/ScanModal.tsx", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Exercise the actual modal's event handlers and effect cleanup without an RFID reader.
function modalHarness({ action }) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let status = "approved";
  const ticket = () => ({ id: "TT-1", status, destination: "Office" });
  const props = { open: true, type: "movement", onClose() {} };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index])
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[index].value,
        (next) => {
          slots[index].value =
            typeof next === "function" ? next(slots[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some(
          (value, i) => !Object.is(value, previous.dependencies[i]),
        )
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const evaluatedModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: evaluatedModule.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/services/ticket.service")
        return { ticketService: { action } };
      if (name === "@/services/rfid.service")
        return {
          rfidService: {
            watchStatus: () => () => {},
            cancel: async () => {},
            scan: async () => ({
              uid: "ABCD",
              employee: { employeeId: "EMP-1", name: "Juan", status: "ACTIVE" },
              rfidToken: "proof",
              movementTickets: [ticket()],
            }),
          },
        };
      return new Proxy(
        {},
        { get: (_target, key) => (key === "__esModule" ? true : () => null) },
      );
    },
    document: {
      body: { style: {} },
      addEventListener() {},
      removeEventListener() {},
    },
    HTMLElement: class {},
  });
  function render() {
    cursor = 0;
    effects = [];
    tree = evaluatedModule.exports.ScanModal(props);
    effects.forEach((effect) => effect());
  }
  function find(predicate, element = tree) {
    if (!element || typeof element !== "object") return null;
    if (Array.isArray(element)) {
      for (const child of element) {
        const match = find(predicate, child);
        if (match) return match;
      }
      return null;
    }
    if (predicate(element)) return element;
    return element.props?.children === undefined
      ? null
      : find(predicate, element.props.children);
  }
  return {
    async settle() {
      for (let i = 0; i < 4; i++) {
        render();
        await new Promise(setImmediate);
      }
    },
    setOpen(open) {
      props.open = open;
    },
    setStatus(next) {
      status = next;
    },
    clickMovement() {
      const button = find(
        (element) =>
          element.type === "button" &&
          element.props.className?.includes("movement-choice"),
      );
      assert.ok(button, "Movement confirmation must be available");
      assert.equal(button.props.disabled, false);
      return button.props.onClick();
    },
  };
}

test("arrival remains clickable after a silently printed departure", async () => {
  const calls = [];
  const modal = modalHarness({
    async action(id, action, token) {
      calls.push({ id, action, token });
      modal.setStatus(action === "start" ? "ongoing" : "completed");
      return {
        requests: [],
        departurePrint: action === "start" ? { mode: "direct" } : undefined,
      };
    },
  });
  await modal.settle();
  const departure = modal.clickMovement();
  await modal.settle();
  modal.setOpen(false);
  await modal.settle();
  modal.setOpen(true);
  await modal.settle();
  await modal.clickMovement();
  assert.deepEqual(
    calls.map((call) => call.action),
    ["start", "complete"],
  );
  assert.equal(calls[1].token, "proof");
  await departure;
});

test("an older session finishing cannot unlock an arrival request in a new session", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const modal = modalHarness({
    action(_id, action) {
      calls.push(action);
      return calls.length === 1 ? first.promise : second.promise;
    },
  });
  await modal.settle();
  const departure = modal.clickMovement();
  modal.setOpen(false);
  await modal.settle();
  modal.setStatus("ongoing");
  modal.setOpen(true);
  await modal.settle();
  const arrival = modal.clickMovement();
  first.resolve({ requests: [] });
  await departure;
  // Use the same rendered handler to simulate a second click before rerendering.
  await modal.clickMovement();
  assert.deepEqual(calls, ["start", "complete"]);
  second.resolve({ requests: [] });
  await arrival;
});
