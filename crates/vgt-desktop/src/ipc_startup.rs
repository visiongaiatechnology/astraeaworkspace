use std::io::{Error, ErrorKind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;

#[allow(dead_code)] // kept for the explicit IPC-readiness probe used by maintenance diagnostics, not the release flow
pub(crate) fn ensure_ipc_server_ready(
    ready_signal: &AtomicBool,
    stop_signal: &AtomicBool,
    server_thread: JoinHandle<()>,
) -> Result<JoinHandle<()>, Error> {
    if ready_signal.load(Ordering::Acquire) && !server_thread.is_finished() {
        return Ok(server_thread);
    }

    stop_signal.store(true, Ordering::Release);
    server_thread
        .join()
        .map_err(|_| Error::other("loopback IPC startup thread failed before readiness"))?;

    Err(Error::new(
        ErrorKind::AddrNotAvailable,
        "loopback IPC server did not become ready; refusing to start the desktop UI",
    ))
}

#[cfg(test)]
mod tests {
    use super::ensure_ipc_server_ready;
    use std::io::ErrorKind;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn ready_server_keeps_its_join_handle_and_does_not_signal_stop() {
        let ready = AtomicBool::new(true);
        let stop = AtomicBool::new(false);
        let (release_sender, release_receiver) = mpsc::channel();
        let server_thread = thread::spawn(move || {
            release_receiver
                .recv()
                .expect("test should release the server thread");
        });

        let retained = ensure_ipc_server_ready(&ready, &stop, server_thread)
            .expect("ready IPC server should allow desktop startup");

        assert!(!stop.load(Ordering::Acquire));
        release_sender
            .send(())
            .expect("server thread should still be waiting");
        retained
            .join()
            .expect("server thread should remain joinable");
    }

    #[test]
    fn exited_server_is_rejected_even_if_it_signaled_readiness() {
        let ready = AtomicBool::new(true);
        let stop = AtomicBool::new(false);
        let server_thread = thread::spawn(|| {});
        while !server_thread.is_finished() {
            thread::yield_now();
        }
        let error = ensure_ipc_server_ready(&ready, &stop, server_thread)
            .expect_err("an exited IPC server must not permit desktop startup");

        assert_eq!(error.kind(), ErrorKind::AddrNotAvailable);
        assert!(stop.load(Ordering::Acquire));
    }

    #[test]
    fn unavailable_server_is_stopped_and_joined_before_startup_is_rejected() {
        let ready = AtomicBool::new(false);
        let stop = Arc::new(AtomicBool::new(false));
        let exited = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let thread_exited = Arc::clone(&exited);
        let server_thread = thread::spawn(move || {
            while !thread_stop.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(1));
            }
            thread_exited.store(true, Ordering::Release);
        });

        let error = ensure_ipc_server_ready(&ready, &stop, server_thread)
            .expect_err("unavailable IPC server must reject desktop startup");

        assert_eq!(error.kind(), ErrorKind::AddrNotAvailable);
        assert!(stop.load(Ordering::Acquire));
        assert!(exited.load(Ordering::Acquire));
    }
}
