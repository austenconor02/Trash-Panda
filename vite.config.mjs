// The project lives on an external Windows drive; polling keeps source updates reliable.
export default { server: { watch: { usePolling:true, interval:400,
  ignored:['**/artifacts/**','**/dist/**'] } } };
