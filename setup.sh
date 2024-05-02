ROOT_DIR=`git rev-parse --show-toplevel`
CHECK="\u2714"
CROSS="\u274c"
PYTHON_VERSION="39"

checkAndInstallHomebrew(){
  which -s brew
  if [[ $? != 0 ]] ; then
      echo "$CROSS Homebrew not present"
      echo "Installing Homebrew"

      # Install Homebrew
      ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

      echo "$CHECK Homebrew installed"
  else
      echo "$CHECK Homebrew present"
      brew update
  fi
}

removeOtherVersionOfPython(){
  brew uninstall --ignore-dependencies python3
}

installRequiredVersionOfPython(){
  brew install python@3.9
}

checkForPython() {
  checkAndInstallHomebrew

  if ! hash python3; then
    echo "Python3 is not installed"
    installRequiredVersionOfPython
  fi

  python_version=`python3 -V`
  ver=$(python3 -V 2>&1 | sed 's/.* \([0-9]\).\([0-9]\).*/\1\2/')
  if [ "$ver" -eq "$PYTHON_VERSION" ]; then
    echo "$CHECK $python_version present"
  else
    echo "$CROSS $python_version present"
    echo "Uninstalling Version of Python"
    removeOtherVersionOfPython
    installRequiredVersionOfPython
  fi
}

installMacOSToolsets(){
  [[ $OSTYPE == 'darwin'* ]] && checkForPython
}



installPackagesInDist(){
  cd "$ROOT_DIR"/release/app
  npm i appium-base-driver appium-xcuitest-driver bufferutil node-pty ws appium --legacy-peer-deps
}


installPackagesInRoot(){
  cd "$ROOT_DIR"
  npm i -g appium-base-driver appium-xcuitest-driver bufferutil node-pty ws appium
  npm i --legacy-peer-deps
  ln -sf "${ROOT_DIR}/node_modules/adbkit/lib" "${ROOT_DIR}/node_modules/adbkit/src"
  ln -sf "${ROOT_DIR}/node_modules/adbkit-monkey/lib" "${ROOT_DIR}/node_modules/adbkit-monkey/src"
  ln -sf "${ROOT_DIR}/node_modules/adbkit-logcat/lib" "${ROOT_DIR}/node_modules/adbkit-logcat/src"
  npm i --legacy-peer-deps
}

installMacOSToolsets
installPackagesInRoot
installPackagesInDist
echo "$CHECK DONE"
