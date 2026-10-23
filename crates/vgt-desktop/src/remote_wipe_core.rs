// 💠 DIAMANT VGT SUPREME STATUS
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WipeStage {
    Keys,
    NativeCache,
    WebCache,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WipeFailure {
    pub stage: WipeStage,
}
pub trait WipeTarget {
    fn wipe_keys(&mut self) -> Result<(), ()>;
    fn wipe_native_cache(&mut self) -> Result<(), ()>;
    fn wipe_web_cache(&mut self) -> Result<(), ()>;
}
pub fn execute_fail_closed<T: WipeTarget>(target: &mut T) -> Result<(), Vec<WipeFailure>> {
    let mut failures = Vec::new();
    if target.wipe_keys().is_err() {
        failures.push(WipeFailure {
            stage: WipeStage::Keys,
        });
    }
    if target.wipe_native_cache().is_err() {
        failures.push(WipeFailure {
            stage: WipeStage::NativeCache,
        });
    }
    if target.wipe_web_cache().is_err() {
        failures.push(WipeFailure {
            stage: WipeStage::WebCache,
        });
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    struct Mock {
        keys: bool,
        native: bool,
        web: bool,
        fail_keys: bool,
    }
    impl WipeTarget for Mock {
        fn wipe_keys(&mut self) -> Result<(), ()> {
            self.keys = true;
            if self.fail_keys {
                Err(())
            } else {
                Ok(())
            }
        }
        fn wipe_native_cache(&mut self) -> Result<(), ()> {
            self.native = true;
            Ok(())
        }
        fn wipe_web_cache(&mut self) -> Result<(), ()> {
            self.web = true;
            Ok(())
        }
    }
    #[test]
    fn wipes_all_stages() {
        let mut m = Mock {
            keys: false,
            native: false,
            web: false,
            fail_keys: false,
        };
        assert!(execute_fail_closed(&mut m).is_ok());
        assert!(m.keys && m.native && m.web)
    }
    #[test]
    fn still_attempts_cache_after_key_failure() {
        let mut m = Mock {
            keys: false,
            native: false,
            web: false,
            fail_keys: true,
        };
        let e = execute_fail_closed(&mut m).unwrap_err();
        assert_eq!(e[0].stage, WipeStage::Keys);
        assert!(m.keys && m.native && m.web)
    }
}
