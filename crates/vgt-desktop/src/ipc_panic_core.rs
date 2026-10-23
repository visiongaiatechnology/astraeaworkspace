// STATUS: DIAMANT VGT SUPREME — dependency-free IPC panic containment core

use std::panic::{catch_unwind, AssertUnwindSafe};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct IpcPanicError {
    pub code: &'static str,
    pub message: &'static str,
}

impl IpcPanicError {
    pub const fn opaque() -> Self {
        Self {
            code: "ipc-internal-fault",
            message: "Native command failed safely.",
        }
    }
}

pub fn catch_dispatch<F>(dispatch: F) -> Result<bool, IpcPanicError>
where
    F: FnOnce() -> bool,
{
    catch_unwind(AssertUnwindSafe(dispatch)).map_err(|_| IpcPanicError::opaque())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_dispatch_is_preserved() {
        assert_eq!(catch_dispatch(|| true), Ok(true));
        assert_eq!(catch_dispatch(|| false), Ok(false));
    }

    #[test]
    fn division_by_zero_is_contained() {
        let error = catch_dispatch(|| -> bool {
            let divisor = std::hint::black_box(0_u64);
            let _ = 1_u64 / divisor;
            true
        })
        .expect_err("panic must be contained");
        assert_eq!(error, IpcPanicError::opaque());
    }

    #[test]
    fn panic_detail_is_not_exposed() {
        let error = catch_dispatch(|| -> bool { panic!("sensitive panic detail") })
            .expect_err("panic must be contained");
        assert_eq!(error.code, "ipc-internal-fault");
        assert_eq!(error.message, "Native command failed safely.");
        assert!(!error.message.contains("sensitive"));
    }
}
