const { User, ApiKey } = require("../database/database")
const admin = require("firebase-admin")

exports.checkToken = async (req, res, next) => {
  try {
    const idToken = req.header('token')
    if(!idToken){
      return res.status(400).json({
        error: "No token,access denied",
        success: false
      })
    }
      admin.auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
          const uid = decodedToken.uid;
          const user = await User.doc(uid).get()
          const userData = user.data()
          if(userData.is_deleted === true){
            return res.status(400).json({
              error: "User not found",
              success: false
            })
          }
          const datas = {id: uid,role: userData.role}
          req.user = datas
          if(userData.role !== 1  && userData.role !== 2){
            return res.status(400).json({
              error: "Access denied",
              success: false
            })
          }
          next()
        })
        .catch((error) => {
          res.status(400).json({
              error: error.message,
              success: false
          })
        });
  } catch (error) {
      res.status(400).json({
          error: error.message,
          success: false
      })
  }
}

exports.checkUserToken = async (req, res, next) => {
  try {
    const idToken = req.header('token')
    if(!idToken){
      return res.status(400).json({
        error: "No token,access denied",
        success: false
      })
    }
      admin.auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
          const uid = decodedToken.uid;
          const user = await User.doc(uid).get()
          const userData = user.data()
          if(userData.is_deleted === true){
            return res.status(400).json({
              error: "User not found",
              success: false
            })
          }
          const datas = {id: uid,role: userData.role}
          req.user = datas
          if(userData.role !== 3){
            return res.status(400).json({
              error: "Access denied",
              success: false
            })
          }
          next()
        })
        .catch((error) => {
          res.status(400).json({
              error: error.message,
              success: false
          })
        });
  } catch (error) {
      res.status(400).json({
          error: error.message,
          success: false
      })
  }
}

exports.checkAllToken = async (req, res, next) => {
  try {
    const idToken = req.header('token')
    if(!idToken){
      return res.status(400).json({
        error: "No token,access denied",
        success: false
      })
    }
      admin.auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
          const uid = decodedToken.uid;
          const user = await User.doc(uid).get()
          const userData = user.data()
          if(userData.is_deleted === true){
            return res.status(400).json({
              error: "User not found",
              success: false
            })
          }
          const datas = {id: uid,role: userData.role}
          req.user = datas
          if(userData.role === 0){
            return res.status(400).json({
              error: "Access denied",
              success: false
            })
          }
          next()
        })
        .catch((error) => {
          res.status(400).json({
              error: error.message,
              success: false
          })
        });
  } catch (error) {
      res.status(400).json({
          error: error.message,
          success: false
      })
  }
}

exports.checkSuperAdminToken = async (req, res, next) => {
  try {
    const idToken = req.header('token')
    if(!idToken){
      return res.status(400).json({
        error: "No token,access denied",
        success: false
      })
    }
      admin.auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
          const uid = decodedToken.uid;
          const user = await User.doc(uid).get()
          const userData = user.data()
          if(userData.is_deleted === true){
            return res.status(400).json({
              error: "User not found",
              success: false
            })
          }
          const datas = {id: uid,role: userData.role}
          req.user = datas
          if(userData.role !== 1){
            return res.status(400).json({
              error: "Access denied",
              success: false
            })
          }
          next()
        })
        .catch((error) => {
          res.status(400).json({
              error: error.message,
              success: false
          })
        });
  } catch (error) {
      res.status(400).json({
          error: error.message,
          success: false
      })
  }
}

exports.checkApiKey = async (req, res, next) => {
  try {
    const email = req.headers.authemail;
    const apiKey = req.headers.apikey;
    console.log(email);
    if(!email){
      return res.status(400).json({
        error: "Please provide authemail",
        success: false
      })
    }else if(!apiKey){
      return res.status(400).json({
        error: "Please provide apikey",
        success: false
      })
    }

    const api = await ApiKey.where("email","==",email).get()
    api.docs.map((a) => {
      if(a.data().api_key === apiKey){
        next()
      }else{
        return res.status(400).json({
          error: "Unauthorized",
          success: false
        })
      }
    })
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false
    })
  }
}