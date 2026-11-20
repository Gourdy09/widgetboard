function printAdmin() {
  const intervalId = setInterval(() => {
    console.log("admin");
  }, 1000);

  return intervalId;
}

// Start the loop
const timer = printAdmin();

// Optional: Stop it after 5 seconds
setTimeout(() => {
  clearInterval(timer);
  console.log("Stopped!");
}, 5000);
