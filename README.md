# Datasette Lite: Fork

Datasette, a python-based data exploration tool running in the browser using WebAssembly and [Pyodide](https://pyodide.org). See the [main Github repository](https://github.com/simonw/datasette-lite) for more details

## Why fork?

- Make it easier to iterate on Datasette-Lite features by splitting the Datasette-Lite demo into smaller pieces
- Make it easier use libraries when writing webworker/serviceworker code

## Costs

- Adding a build system adds some maintenance complexity that may make some types of debugging harder
- Contributing may become easier for frontend developers, but harder for developers who are not regularly keeping NodeJS up to date on their systems. This is a tradeoff I'm willing to make while hacking, but may change to a simpler templating system in the future

## Fork changes

- Add a build system to enable developing code into smaller pieces
- Make site analytics code optional

## Development

Install + run local dev server

```bash
yarn install
yarn dev
```
