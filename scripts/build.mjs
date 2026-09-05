// Vinext's successful process.exit(0) can race native worker teardown on
// Windows (UV_HANDLE_CLOSING). Let successful builds drain naturally there;
// preserve nonzero exits so compilation and prerender errors still fail CI.
if (process.platform === 'win32') {
  const exit = process.exit.bind(process);
  process.exit = (code) => {
    if (Number(code) !== 0) return exit(code);
    process.exitCode = 0;
  };
}

process.argv = [process.execPath, 'vinext', 'build', ...process.argv.slice(2)];
await import('../node_modules/vinext/dist/cli.js');
