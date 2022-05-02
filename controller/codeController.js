const admin = require("firebase-admin");
const {
  Code,
  Product,
  CodeHistory,
  User,
  StripePayment,
} = require("../database/database");
const moment = require("moment");
const { sendMail } = require("../utils/sendMail");
const { response } = require("express");
const { addToMailchimpList } = require("../utils/mailchimp");
const htmlMail = require("../utils/htmlMail");
const stripe = require("stripe")(
  "sk_test_51JKKzMSHR9BxipxqxQzhrRb0clcRdxLMVkrqttME0VSCD5r2PifZ8LJ7wUqf0XhuZpQA0l2VNNrLq7osYw1WnXT700amRGEZ23",
  { apiVersion: "2020-08-27" }
);

exports.addCode = async (req, res) => {
  try {
    const data = req.body.data;

    let array = [];
    if (data.length > 0) {
      const database = admin.firestore();
      let validateIds = [];

      const resp = await Promise.allSettled(
        data.map(async (single) => {
          const response = await Code.where("code", "==", single.code).get();
          if (response.docs.length > 0) {
            validateIds.push(single.code);
          }
          return response;
        })
      );

      if (resp) {
        if (validateIds.length > 0) {
          return res.status(400).json({
            error: validateIds.join(",") + " already exist",
            success: false,
          });
        }
      }

      const batch = database.batch();

      data.forEach((i) => {
        const a = batch.set(Code.doc(), i);
        array.push(a);
      });
      await batch.commit();

      let idArray = [];
      const addData = array[0];
      const addedIdData = addData._ops;
      addedIdData.forEach((e) => {
        const id = e.docPath.split("/")[1];
        idArray.push(id);
      });

      let arrayOfDatas = [];

      for (i of idArray) {
        const getDataOfCode = await Code.doc(i).get();
        const datas = {
          id: getDataOfCode.id,
          ...getDataOfCode.data(),
        };
        arrayOfDatas.push(datas);
      }
      if (arrayOfDatas.length > 0) {
        return res.status(200).json({
          data: arrayOfDatas,
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Code not found",
          success: false,
        });
      }
    } else {
      return res.status(400).json({
        error: "Please provide valid information",
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.codes = async (req, res) => {
  try {
    const tokenData = req.user;
    if (tokenData.role === 1) {
      let array = [];
      const codes = await Code.where("is_deleted", "==", false).get();

      codes.forEach(async (i) => {
        const datas = {
          id: i.id,
          ...i.data(),
        };
        array.push(datas);
      });

      return res.status(200).json({
        data: array,
        success: true,
      });
    } else if (tokenData.role === 2) {
      let array = [];
      const codes = await Code.where("is_deleted", "==", false)
        .where("parent_id", "==", tokenData.id)
        .get();
      codes.forEach((i) => {
        const datas = {
          id: i.id,
          ...i.data(),
        };
        array.push(datas);
      });
      if (array.length > 0) {
        return res.status(200).json({
          data: array,
          success: true,
        });
      } else {
        return res.status(400).json({
          error: "Record not found",
          success: false,
        });
      }
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.code = async (req, res) => {
  try {
    const tokenData = req.user;
    if (tokenData.role === 1) {
      let array = [];
      const codeId = req.query.id;
      if (!codeId) {
        return res.status(400).json({
          error: "Please enter id",
          success: false,
        });
      }
      const code = await Code.doc(codeId).get();
      const codeData = code.data();
      array.push(codeData);
      if (array.length > 0) {
        return res.status(200).json({
          data: {
            id: codeId,
            ...array[0],
          },
          success: true,
        });
      }
    } else if (tokenData.role === 2) {
      let array = [];
      const codeId = req.query.id;
      if (!codeId) {
        return res.status(400).json({
          error: "Please enter id",
          success: false,
        });
      }
      const code = await Code.doc(codeId).get();
      const codeData = code.data();
      if (codeData.parent_id === tokenData.id) {
        array.push(codeData);
        if (array.length > 0) {
          return res.status(200).json({
            data: {
              id: codeId,
              ...array[0],
            },
            success: true,
          });
        }
      } else {
        return res.status(400).json({
          error: "Record not found",
          success: false,
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.updateCode = async (req, res) => {
  try {
    const now = moment().format("YYYY-MM-DD");
    const tokenData = req.user;
    const codeId = req.body.id;
    const data = req.body.data;

    if (!codeId.length === 0) {
      return res.status(400).json({
        error: "Please enter id",
        success: false,
      });
    }

    if (codeId.length === 1 && data.code) {
      const response = await Code.where("code", "==", data.code)
        .where("is_deleted", "==", false)
        .get();
      if (response.docs.length > 0) {
        const data = response.docs.map((a) => {
          return {
            id: a.id,
            ...a.data(),
          };
        });
        if (data[0].id !== codeId[0]) {
          return res.status(400).json({
            error: "code already exist",
            success: false,
          });
        }
      }
    }

    let array = [];
    let newArray = [];
    if (tokenData.role === 1) {
      for (i of codeId) {
        const activeCodeId = i;
        if (data.activation === true) {
          const codes = await Code.doc(i).get();
          const codesData = codes.data();
          const codeDataCode = codesData.code;
          const redeemCode = codeDataCode;
          const codeHistory = await CodeHistory
            .where("user_id", "==", codesData.user_id)
            .get();

          const codeHistoryData = codeHistory.docs.map((e) => {
            return {
              id: e.id,
              ...e.data(),
            };
          });
          const filteredCodeHistoryData = codeHistoryData.filter((f) => {
            return f.activation;
          });

          if (!(filteredCodeHistoryData.length > 0)) {
            return res.status(400).json({
              error: "no user found for this code !!",
              success: false,
            });
          }
          let users = await User.doc(filteredCodeHistoryData[0].user_id).get();
          let user = {
            id: users.id,
            ...users.data(),
          };
          // user = await filteredCodeHistoryData.forEach(async (i)=>{
          //   const users = await User.doc(i.user_id).get();
          //   return
          // })
          // for (i of filteredCodeHistoryData) {

          //   const data = {
          //     id: users.id,
          //     ...users.data(),
          //   };
          //   user.push(data);
          // }

          let userId = user.id;

          const activeCodeHistoryData = codeHistoryData.find(
            (c) => c.code == codeDataCode
          );
          if (!activeCodeHistoryData) {
            return res.status(400).json({
              error: "No active code found !!",
              success: false,
            });
          }
          const expiryDate = moment(activeCodeHistoryData.expiry_date).format(
            "YYYY-MM-DD"
          );
          // let betterCodes = filteredCodeHistoryData
          //   .filter((c) => new Date(c.expiry_date) > new Date(expiryDate))
          //   .map((ccc) => ccc.code);
          let betterCodes = [];
          let updatedPurchased = [];

          const activeProductsDocArray = await Product.where(
            "is_deleted",
            "==",
            false
          ).get();
          const activeProducts = activeProductsDocArray.docs.map((pdoc) => {
            return {
              ...pdoc.data(),
              id: pdoc.id,
            };
          });

          let newPurchased = user.purchased.map((pro) => {
            return {
              ...pro,
              apps: pro.apps.map((proapp) => {
                if (proapp.code_used == redeemCode) {
                  return {
                    ...proapp,
                    active: false,
                    activated_on: "",
                    code_used: "",
                  };
                } else {
                  return proapp;
                }
              }),
              features: pro.features.map((profeature) => {
                if (profeature.code_used == redeemCode) {
                  return {
                    ...profeature,
                    active: false,
                    activated_on: "",
                    code_used: "",
                  };
                } else {
                  return profeature;
                }
              }),
            };
          });
          let purchasedDeactivated = newPurchased;
          let codesToRedeem = codeHistoryData.filter(
            (c) =>
            c.activation &&
            (activeCodeHistoryData.overlapped_codes &&
            activeCodeHistoryData.overlapped_codes.includes(c.code))
          );

          codesToRedeem.forEach((redeemCode) => {
            const newp2a = activeProducts.map((p) => {
              const alreadyExistProduct = redeemCode.product_activated.filter(
                (e, i) => e.id === p.id
              );
              if (alreadyExistProduct.length > 0) {
                return {
                  ...alreadyExistProduct[0],
                  apps: p.apps.map((ap) => {
                    const PurchasedApp = alreadyExistProduct[0].apps.filter(
                      (a, i) => a.id === ap.id
                    );
                    if (PurchasedApp.length > 0) {
                      return PurchasedApp[0];
                    } else {
                      return {
                        id: ap.id,
                        isChecked: false,
                        title: ap.title,
                      };
                    }
                  }),
                  features: p.features.map((fa) => {
                    const PurchasedFeature =
                      alreadyExistProduct[0].features.filter(
                        (a, i) => a.id === fa.id
                      );
                    if (PurchasedFeature.length > 0) {
                      return PurchasedFeature[0];
                    } else {
                      return {
                        id: fa.id,
                        isChecked: false,
                        title: fa.title,
                      };
                    }
                  }),
                };
              } else {
                return {
                  id: p.id,
                  activeCount: 0,
                  title: p.title,
                  apps: p.apps.map((ap) => {
                    return {
                      id: ap.id,
                      isChecked: false,
                      title: ap.title,
                    };
                  }),
                  features: p.features.map((fa) => {
                    return {
                      id: fa.id,
                      isChecked: false,
                      title: fa.title,
                    };
                  }),
                };
              }
            });
            newPurchased = newp2a.map((pTa) => {
              const alreadyExistProduct = purchasedDeactivated.filter(
                (e, i) => e.id === pTa.id
              );

              if (alreadyExistProduct.length > 0) {
                return {
                  ...alreadyExistProduct[0],
                  title: pTa.title,
                  apps: pTa.apps.map((app) => {
                    const PurchasedApp = alreadyExistProduct[0].apps.filter(
                      (a, i) => a.id === app.id
                    );
                    if (PurchasedApp.length > 0) {
                      return {
                        ...PurchasedApp[0],
                        code_used: betterCodes.includes(
                          PurchasedApp[0].code_used
                        )
                          ? PurchasedApp[0].code_used
                          : app.isChecked
                          ? redeemCode.code
                          : PurchasedApp[0].code_used,
                        active: betterCodes.includes(PurchasedApp[0].code_used)
                          ? PurchasedApp[0].active
                          : app.isChecked
                          ? app.isChecked
                          : PurchasedApp[0].active,
                        activated_on: betterCodes.includes(
                          PurchasedApp[0].code_used
                        )
                          ? PurchasedApp[0].activated_on
                          : app.isChecked
                          ? new Date()
                          : PurchasedApp[0].activated_on,
                        title: app.title,
                      };
                    } else {
                      return {
                        id: app.id,
                        data: {},
                        launches_since_activation: 0,
                        last_used: new Date(),
                        notes: "",
                        title: app.title,
                        code_used: app.isChecked ? redeemCode.code : "",
                        active: app.isChecked,
                        activated_on: app.isChecked ? new Date() : "",
                      };
                    }
                  }),
                  features: pTa.features.map((feature) => {
                    const PurchasedFeature =
                      alreadyExistProduct[0].features.filter(
                        (f, i) => f.id === feature.id
                      );
                    if (PurchasedFeature.length > 0) {
                      return {
                        ...PurchasedFeature[0],
                        code_used: betterCodes.includes(
                          PurchasedFeature[0].code_used
                        )
                          ? PurchasedFeature[0].code_used
                          : feature.isChecked
                          ? redeemCode.code
                          : PurchasedFeature[0].code_used,
                        active: betterCodes.includes(
                          PurchasedFeature[0].code_used
                        )
                          ? PurchasedFeature[0].active
                          : feature.isChecked
                          ? feature.isChecked
                          : PurchasedFeature[0].active,
                        activated_on: betterCodes.includes(
                          PurchasedFeature[0].code_used
                        )
                          ? PurchasedFeature[0].activated_on
                          : feature.isChecked
                          ? new Date()
                          : PurchasedFeature[0].activated_on,
                        title: feature.title,
                      };
                    } else {
                      return {
                        id: feature.id,
                        data: {},
                        launches_since_activation: 0,
                        last_used: new Date(),
                        notes: "",
                        title: feature.title,
                        code_used: feature.isChecked ? redeemCode.code : "",
                        active: feature.isChecked,
                        activated_on: feature.isChecked ? new Date() : "",
                      };
                    }
                  }),
                };
              } else {
                return {
                  id: pTa.id,
                  activeCount: 0,
                  title: pTa.title,
                  data: {},
                  apps: pTa.apps.map((app) => {
                    return {
                      id: app.id,
                      title: app.title,
                      data: {},
                      launches_since_activation: 0,
                      last_used: new Date(),
                      notes: "",
                      code_used: app.isChecked ? redeemCode.code : "",
                      active: app.isChecked,
                      activated_on: app.isChecked ? new Date() : "",
                    };
                  }),
                  features: pTa.features.map((feature) => {
                    return {
                      id: feature.id,
                      title: feature.title,
                      data: {},
                      launches_since_activation: 0,
                      last_used: new Date(),
                      notes: "",
                      code_used: feature.isChecked ? redeemCode.code : "",
                      active: feature.isChecked,
                      activated_on: feature.isChecked ? new Date() : "",
                    };
                  }),
                };
              }
            });
          });

          updatedPurchased = newPurchased.map((e) => {
            return {
              ...e,
              activeCount:
                e.apps.filter((a) => a.active).length +
                e.features.filter((f) => f.active).length,
            };
          });
          await CodeHistory.doc(activeCodeHistoryData.id).update({
            activation: false,
          });
          await User.doc(userId).update({
            purchased: updatedPurchased,
          });
        }
        await Code.doc(activeCodeId).update(data);
        const code = await Code.doc(activeCodeId).get();
        const datas = {
          id: code.id,
          ...code.data(),
        };
        array.push(datas);
      }
      return res.status(200).json({
        data: array,
        success: true,
      });
    } else if (tokenData.role === 2) {
      codeId.forEach(async (i) => {
        const code = await Code.doc(i).get();
        const codeData = code.data();
        if (codeData.parent_id === tokenData.id) {
          if (data.activation === true) {
            const codes = await Code.doc(i).get();
            const codesData = codes.data();
            const codeDataCode = codesData.code;
            const codeHistory = await CodeHistory.where(
              "code",
              "==",
              codeDataCode
            ).get();
            const codeHistortyData = codeHistory.docs.map((e) => e.data());
            const filteredCodeHistoryData = await codeHistortyData.filter(
              (f) => {
                const expiryDate = moment(f.expiry_date).format("YYYY-MM-DD");
                if (expiryDate > now) {
                  return f;
                }
              }
            );
            let user = [];
            for (i of filteredCodeHistoryData) {
              const users = await User.doc(i.user_id).get();
              const data = {
                id: users.id,
                ...users.data(),
              };
              user.push(data);
            }
            const userId = user[0].id;
            const firstname = user[0].firstname;
            const lastname = user[0].lastname;
            const email = user[0].email;
            const activeCodeHistoryData = codeHistoryData.find(
              (c) => c.code == codeDataCode
            );
            if (!activeCodeHistoryData) {
              return res.status(400).json({
                error: "No active code found !!",
                success: false,
              });
            }
            const expiryDate = moment(activeCodeHistoryData.expiry_date).format(
              "YYYY-MM-DD"
            );
            let betterCodes = filteredCodeHistoryData
              .filter((c) => new Date(c.expiry_date) > new Date(expiryDate))
              .map((ccc) => ccc.code);
            let updatedPurchased = [];

            const activeProductsDocArray = await Product.where(
              "is_deleted",
              "==",
              false
            ).get();
            const activeProducts = activeProductsDocArray.docs.map((pdoc) => {
              return {
                ...pdoc.data(),
                id: pdoc.id,
              };
            });

            const p2a = activeProducts.map((p) => {
              const alreadyExistProduct =
                filteredCodeHistoryData.product_activated.filter(
                  (e, i) => e.id === p.id
                );
              if (alreadyExistProduct.length > 0) {
                return {
                  ...alreadyExistProduct[0],
                  apps: p.apps.map((ap) => {
                    const PurchasedApp = alreadyExistProduct[0].apps.filter(
                      (a, i) => a.id === ap.id
                    );
                    if (PurchasedApp.length > 0) {
                      return PurchasedApp[0];
                    } else {
                      return {
                        id: ap.id,
                        isChecked: false,
                        title: ap.title,
                      };
                    }
                  }),
                  features: p.features.map((fa) => {
                    const PurchasedFeature =
                      alreadyExistProduct[0].features.filter(
                        (a, i) => a.id === fa.id
                      );
                    if (PurchasedFeature.length > 0) {
                      return PurchasedFeature[0];
                    } else {
                      return {
                        id: fa.id,
                        isChecked: false,
                        title: fa.title,
                      };
                    }
                  }),
                };
              } else {
                return {
                  id: p.id,
                  activeCount: 0,
                  title: p.title,
                  apps: p.apps.map((ap) => {
                    return {
                      id: ap.id,
                      isChecked: false,
                      title: ap.title,
                    };
                  }),
                  features: p.features.map((fa) => {
                    return {
                      id: fa.id,
                      isChecked: false,
                      title: fa.title,
                    };
                  }),
                };
              }
            });

            if (activation) {
              const products = p2a.map((pTa) => {
                const alreadyExistProduct = user.purchased.filter(
                  (e, i) => e.id === pTa.id
                );
                if (alreadyExistProduct.length > 0) {
                  return {
                    ...alreadyExistProduct[0],
                    title: pTa.title,
                    apps: pTa.apps.map((app) => {
                      const PurchasedApp = alreadyExistProduct[0].apps.filter(
                        (a, i) => a.id === app.id
                      );
                      if (PurchasedApp.length > 0) {
                        return {
                          ...PurchasedApp[0],
                          code_used: betterCodes.includes(
                            PurchasedApp[0].code_used
                          )
                            ? PurchasedApp[0].code_used
                            : app.isChecked
                            ? redeemCode
                            : PurchasedApp[0].code_used,
                          active: betterCodes.includes(
                            PurchasedApp[0].code_used
                          )
                            ? PurchasedApp[0].active
                            : app.isChecked
                            ? app.isChecked
                            : PurchasedApp[0].active,
                          activated_on: betterCodes.includes(
                            PurchasedApp[0].code_used
                          )
                            ? PurchasedApp[0].activated_on
                            : app.isChecked
                            ? new Date()
                            : PurchasedApp[0].activated_on,
                          title: app.title,
                        };
                      } else {
                        return {
                          id: app.id,
                          data: {},
                          launches_since_activation: 0,
                          last_used: new Date(),
                          notes: "",
                          title: app.title,
                          code_used: app.isChecked ? redeemCode : "",
                          active: app.isChecked,
                          activated_on: app.isChecked ? new Date() : "",
                        };
                      }
                    }),
                    features: pTa.features.map((feature) => {
                      const PurchasedFeature =
                        alreadyExistProduct[0].features.filter(
                          (f, i) => f.id === feature.id
                        );
                      if (PurchasedFeature.length > 0) {
                        return {
                          ...PurchasedFeature[0],
                          code_used: betterCodes.includes(
                            PurchasedFeature[0].code_used
                          )
                            ? PurchasedFeature[0].code_used
                            : feature.isChecked
                            ? redeemCode
                            : PurchasedFeature[0].code_used,
                          active: betterCodes.includes(
                            PurchasedFeature[0].code_used
                          )
                            ? PurchasedFeature[0].active
                            : feature.isChecked
                            ? feature.isChecked
                            : PurchasedFeature[0].active,
                          activated_on: betterCodes.includes(
                            PurchasedFeature[0].code_used
                          )
                            ? PurchasedFeature[0].activated_on
                            : feature.isChecked
                            ? new Date()
                            : PurchasedFeature[0].activated_on,
                          title: feature.title,
                        };
                      } else {
                        return {
                          id: feature.id,
                          data: {},
                          launches_since_activation: 0,
                          last_used: new Date(),
                          notes: "",
                          title: feature.title,
                          code_used: feature.isChecked ? redeemCode : "",
                          active: feature.isChecked,
                          activated_on: feature.isChecked ? new Date() : "",
                        };
                      }
                    }),
                  };
                } else {
                  return {
                    id: pTa.id,
                    activeCount: 0,
                    title: pTa.title,
                    data: {},
                    apps: pTa.apps.map((app) => {
                      return {
                        id: app.id,
                        title: app.title,
                        data: {},
                        launches_since_activation: 0,
                        last_used: new Date(),
                        notes: "",
                        code_used: app.isChecked ? redeemCode : "",
                        active: app.isChecked,
                        activated_on: app.isChecked ? new Date() : "",
                      };
                    }),
                    features: pTa.features.map((feature) => {
                      return {
                        id: feature.id,
                        title: feature.title,
                        data: {},
                        launches_since_activation: 0,
                        last_used: new Date(),
                        notes: "",
                        code_used: feature.isChecked ? redeemCode : "",
                        active: feature.isChecked,
                        activated_on: feature.isChecked ? new Date() : "",
                      };
                    }),
                  };
                }
              });
              const activeCount = products.map((e) => {
                return {
                  ...e,
                  activeCount:
                    e.apps.filter((a) => a.active).length +
                    e.features.filter((f) => f.active).length,
                };
              });

              updatedPurchased = activeCount;

              await CodeHistory.doc(activeCodeHistoryData.id).update({
                activation: true,
              });
            }
            const mailChimpDetails = {
              purchased: updatedPurchased,
              email,
              firstname,
              lastname,
            };
            addToMailchimpList(mailChimpDetails);

            await User.doc(userId).update({
              purchased: updatedPurchased,
            });
          }
          await Code.doc(i).update(data);
          const code = await Code.doc(i).get();
          const datas = {
            id: code.id,
            ...code.data(),
          };
          newArray.push(datas);
        }
      });
      return res.status(200).json({
        data: newArray,
        success: true,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.deleteMultipleCodes = async (req, res) => {
  try {
    const tokenData = req.user;
    if (tokenData.role === 1) {
      const codeId = req.body.id;
      if (!codeId) {
        return res.status(400).json({
          error: "Please enter id",
          success: false,
        });
      }
      const database = admin.firestore();
      const batch = database.batch();
      const arr = await codeId.map((e) => Code.doc(e));

      arr.forEach((i) => {
        batch.update(i, { is_deleted: true });
      });
      await batch.commit();
      return res.status(200).json({
        data: "Record deleted",
        success: true,
      });
    } else if (tokenData.role === 2) {
      const codeId = req.body.id;
      if (!codeId) {
        return res.status(400).json({
          error: "Please enter id",
          success: false,
        });
      }
      const database = admin.firestore();
      const batch = database.batch();
      const arr = codeId.map((e) => Code.doc(e));
      arr.forEach((i) => {
        if (i.parent_id === tokenData.id) {
          batch.update(i, { is_deleted: true });
        }
      });
      await batch.commit();
      return res.status(200).json({
        data: "Record deleted",
        success: true,
      });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.checkCodeIsActiveOrNot = async (req, res) => {
  try {
    const now = moment().format("YYYY-MM-DD");
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({
        error: "Please enter code",
        success: false,
      });
    }
    let array = [];
    const codes = await Code.where("code", "==", code.trim())
      .where("is_deleted", "==", false)
      .get();
    const codeData = codes.docs.map((i) => i.data());

    if (codeData.length < 1) {
      return res.status(400).json({
        error: "Code not found",
        success: false,
      });
    }
    const codeHistory = await CodeHistory.where("code", "==", code).get();
    for (c of codeHistory.docs) {
      const expiryDate = c.data().expiry_date;
      if (expiryDate > now) {
        return res.status(400).json({
          error: "Code already in use",
          success: false,
        });
      }
    }
    const activeProductsDocs = await Product.where(
      "is_deleted",
      "==",
      false
    ).get();
    const activeProducts = activeProductsDocs.docs.map((p) => p.id);

    const data = {
      ...codeData[0],
      products_to_activate: codeData[0].products_to_activate.filter((e) =>
        activeProducts.includes(e.id)
      ),
    };

    if (data) {
      return res.status(200).json({
        data: data,
        success: true,
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.getCodeHistory = async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) {
      return res.status(400).json({
        error: "Please enter userId",
        success: false,
      });
    }
    const code = await CodeHistory.where("user_id", "==", userId).get();
    const codeData = code.docs.map((e) => {
      return {
        id: e.id,
        ...e.data(),
      };
    });

    return res.status(200).json({
      data: codeData,
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      success: false,
    });
  }
};

exports.activeDeactiveCode = async (req, res) => {
  try {
    const userId = req.body.user_id;
    const activation = req.body.activation;
    const code = req.body.code;
    let redeemCode = code;
    if (!userId) {
      return res.status(400).json({
        error: "Please enter userId",
        success: false,
      });
    }
    const codes = await CodeHistory.where("user_id", "==", userId).get();
    const userDoc = await User.doc(userId).get();
    const user = {
      id: userDoc.id,
      ...userDoc.data(),
    };
    const firstname = user.firstname;
    const lastname = user.lastname;
    const email = user.email;

    if (!user) {
      return res.status(400).json({
        error: "User not found",
        success: false,
      });
    }
    const codeHistoryData = codes.docs.map((e) => {
      return {
        id: e.id,
        ...e.data(),
      };
    });
    const activeCodeHistoryData = codeHistoryData.find(
      (c) => c.code == code && c.activation === !activation
    );
    if (!activeCodeHistoryData) {
      return res.status(400).json({
        error: "No active code found !!",
        success: false,
      });
    }

    const expiryDate = moment(activeCodeHistoryData.expiry_date).format(
      "YYYY-MM-DD"
    );
    let betterCodes = [];

    let updatedPurchased = [];

    const activeProductsDocArray = await Product.where(
      "is_deleted",
      "==",
      false
    ).get();
    const activeProducts = activeProductsDocArray.docs.map((pdoc) => {
      return {
        ...pdoc.data(),
        id: pdoc.id,
      };
    });

    const p2a = activeProducts.map((p) => {
      const alreadyExistProduct =
        activeCodeHistoryData.product_activated.filter((e, i) => e.id === p.id);
      if (alreadyExistProduct.length > 0) {
        return {
          ...alreadyExistProduct[0],
          apps: p.apps.map((ap) => {
            const PurchasedApp = alreadyExistProduct[0].apps.filter(
              (a, i) => a.id === ap.id
            );
            if (PurchasedApp.length > 0) {
              return PurchasedApp[0];
            } else {
              return {
                id: ap.id,
                isChecked: false,
                title: ap.title,
              };
            }
          }),
          features: p.features.map((fa) => {
            const PurchasedFeature = alreadyExistProduct[0].features.filter(
              (a, i) => a.id === fa.id
            );
            if (PurchasedFeature.length > 0) {
              return PurchasedFeature[0];
            } else {
              return {
                id: fa.id,
                isChecked: false,
                title: fa.title,
              };
            }
          }),
        };
      } else {
        return {
          id: p.id,
          activeCount: 0,
          title: p.title,
          apps: p.apps.map((ap) => {
            return {
              id: ap.id,
              isChecked: false,
              title: ap.title,
            };
          }),
          features: p.features.map((fa) => {
            return {
              id: fa.id,
              isChecked: false,
              title: fa.title,
            };
          }),
        };
      }
    });

    const codeDoc = await Code.where("code", "==", redeemCode).get();
    const codeData = codeDoc.docs.map((c) => {
      return {
        id: c.id,
        ...c.data(),
      };
    });

    if (activation) {
      const codeHistory = await CodeHistory.where("code", "==", redeemCode)
        .where("activation", "==", true)
        .get();
      const codeHistortyData = codeHistory.docs.map((c) => {
        return {
          id: c.id,
          ...c.data(),
        };
      });
      for (i of codeHistortyData) {
        const expiry_date = moment(i.expiry_date).format("YYYY-MM-DD");
        const now = moment().format("YYYY-MM-DD");
        if (expiry_date > now) {
          if (i) {
            return res.status(400).json({
              error: "Code already in use !!",
              success: false,
            });
          }
        }
      }
      const products = p2a.map((pTa) => {
        const alreadyExistProduct = user.purchased.filter(
          (e, i) => e.id === pTa.id
        );
        if (alreadyExistProduct.length > 0) {
          return {
            ...alreadyExistProduct[0],
            title: pTa.title,
            apps: pTa.apps.map((app) => {
              const PurchasedApp = alreadyExistProduct[0].apps.filter(
                (a, i) => a.id === app.id
              );
              if (PurchasedApp.length > 0) {
                return {
                  ...PurchasedApp[0],
                  code_used: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].code_used
                    : app.isChecked
                    ? redeemCode
                    : PurchasedApp[0].code_used,
                  active: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].active
                    : app.isChecked
                    ? app.isChecked
                    : PurchasedApp[0].active,
                  activated_on: betterCodes.includes(PurchasedApp[0].code_used)
                    ? PurchasedApp[0].activated_on
                    : app.isChecked
                    ? new Date()
                    : PurchasedApp[0].activated_on,
                  title: app.title,
                };
              } else {
                return {
                  id: app.id,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  title: app.title,
                  code_used: app.isChecked ? redeemCode : "",
                  active: app.isChecked,
                  activated_on: app.isChecked ? new Date() : "",
                };
              }
            }),
            features: pTa.features.map((feature) => {
              const PurchasedFeature = alreadyExistProduct[0].features.filter(
                (f, i) => f.id === feature.id
              );
              if (PurchasedFeature.length > 0) {
                return {
                  ...PurchasedFeature[0],
                  code_used: betterCodes.includes(PurchasedFeature[0].code_used)
                    ? PurchasedFeature[0].code_used
                    : feature.isChecked
                    ? redeemCode
                    : PurchasedFeature[0].code_used,
                  active: betterCodes.includes(PurchasedFeature[0].code_used)
                    ? PurchasedFeature[0].active
                    : feature.isChecked
                    ? feature.isChecked
                    : PurchasedFeature[0].active,
                  activated_on: betterCodes.includes(
                    PurchasedFeature[0].code_used
                  )
                    ? PurchasedFeature[0].activated_on
                    : feature.isChecked
                    ? new Date()
                    : PurchasedFeature[0].activated_on,
                  title: feature.title,
                };
              } else {
                return {
                  id: feature.id,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  title: feature.title,
                  code_used: feature.isChecked ? redeemCode : "",
                  active: feature.isChecked,
                  activated_on: feature.isChecked ? new Date() : "",
                };
              }
            }),
          };
        } else {
          return {
            id: pTa.id,
            activeCount: 0,
            title: pTa.title,
            data: {},
            apps: pTa.apps.map((app) => {
              return {
                id: app.id,
                title: app.title,
                data: {},
                launches_since_activation: 0,
                last_used: new Date(),
                notes: "",
                code_used: app.isChecked ? redeemCode : "",
                active: app.isChecked,
                activated_on: app.isChecked ? new Date() : "",
              };
            }),
            features: pTa.features.map((feature) => {
              return {
                id: feature.id,
                title: feature.title,
                data: {},
                launches_since_activation: 0,
                last_used: new Date(),
                notes: "",
                code_used: feature.isChecked ? redeemCode : "",
                active: feature.isChecked,
                activated_on: feature.isChecked ? new Date() : "",
              };
            }),
          };
        }
      });
      const activeCount = products.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });

      updatedPurchased = activeCount;
      await Code.doc(codeData[0].id).update({
        activation: false,
        already_used: true,
      });
      await CodeHistory.doc(activeCodeHistoryData.id).update({
        activation: true,
      });
    } else {
      let newPurchased = user.purchased.map((pro) => {
        return {
          ...pro,
          apps: pro.apps.map((proapp) => {
            if (proapp.code_used == redeemCode) {
              return {
                ...proapp,
                active: false,
                activated_on: "",
                code_used: "",
              };
            } else {
              return proapp;
            }
          }),
          features: pro.features.map((profeature) => {
            if (profeature.code_used == redeemCode) {
              return {
                ...profeature,
                active: false,
                activated_on: "",
                code_used: "",
              };
            } else {
              return profeature;
            }
          }),
        };
      });
      let purchasedDeactivated = newPurchased;

      let codesToRedeem = codeHistoryData.filter(
        (c) =>
        c.activation &&
          activeCodeHistoryData.overlapped_codes &&
          activeCodeHistoryData.overlapped_codes.includes(c.code)
      );

      codesToRedeem.forEach((redeemCode) => {
        const newp2a = activeProducts.map((p) => {
          const alreadyExistProduct = redeemCode.product_activated.filter(
            (e, i) => e.id === p.id
          );
          if (alreadyExistProduct.length > 0) {
            return {
              ...alreadyExistProduct[0],
              apps: p.apps.map((ap) => {
                const PurchasedApp = alreadyExistProduct[0].apps.filter(
                  (a, i) => a.id === ap.id
                );
                if (PurchasedApp.length > 0) {
                  return PurchasedApp[0];
                } else {
                  return {
                    id: ap.id,
                    isChecked: false,
                    title: ap.title,
                  };
                }
              }),
              features: p.features.map((fa) => {
                const PurchasedFeature = alreadyExistProduct[0].features.filter(
                  (a, i) => a.id === fa.id
                );
                if (PurchasedFeature.length > 0) {
                  return PurchasedFeature[0];
                } else {
                  return {
                    id: fa.id,
                    isChecked: false,
                    title: fa.title,
                  };
                }
              }),
            };
          } else {
            return {
              id: p.id,
              activeCount: 0,
              title: p.title,
              apps: p.apps.map((ap) => {
                return {
                  id: ap.id,
                  isChecked: false,
                  title: ap.title,
                };
              }),
              features: p.features.map((fa) => {
                return {
                  id: fa.id,
                  isChecked: false,
                  title: fa.title,
                };
              }),
            };
          }
        });
        newPurchased = newp2a.map((pTa) => {
          const alreadyExistProduct = purchasedDeactivated.filter(
            (e, i) => e.id === pTa.id
          );

          if (alreadyExistProduct.length > 0) {
            return {
              ...alreadyExistProduct[0],
              title: pTa.title,
              apps: pTa.apps.map((app) => {
                const PurchasedApp = alreadyExistProduct[0].apps.filter(
                  (a, i) => a.id === app.id
                );
                if (PurchasedApp.length > 0) {
                  return {
                    ...PurchasedApp[0],
                    code_used: betterCodes.includes(PurchasedApp[0].code_used)
                      ? PurchasedApp[0].code_used
                      : app.isChecked
                      ? redeemCode.code
                      : PurchasedApp[0].code_used,
                    active: betterCodes.includes(PurchasedApp[0].code_used)
                      ? PurchasedApp[0].active
                      : app.isChecked
                      ? app.isChecked
                      : PurchasedApp[0].active,
                    activated_on: betterCodes.includes(
                      PurchasedApp[0].code_used
                    )
                      ? PurchasedApp[0].activated_on
                      : app.isChecked
                      ? new Date()
                      : PurchasedApp[0].activated_on,
                    title: app.title,
                  };
                } else {
                  return {
                    id: app.id,
                    data: {},
                    launches_since_activation: 0,
                    last_used: new Date(),
                    notes: "",
                    title: app.title,
                    code_used: app.isChecked ? redeemCode.code : "",
                    active: app.isChecked,
                    activated_on: app.isChecked ? new Date() : "",
                  };
                }
              }),
              features: pTa.features.map((feature) => {
                const PurchasedFeature = alreadyExistProduct[0].features.filter(
                  (f, i) => f.id === feature.id
                );
                if (PurchasedFeature.length > 0) {
                  return {
                    ...PurchasedFeature[0],
                    code_used: betterCodes.includes(
                      PurchasedFeature[0].code_used
                    )
                      ? PurchasedFeature[0].code_used
                      : feature.isChecked
                      ? redeemCode.code
                      : PurchasedFeature[0].code_used,
                    active: betterCodes.includes(PurchasedFeature[0].code_used)
                      ? PurchasedFeature[0].active
                      : feature.isChecked
                      ? feature.isChecked
                      : PurchasedFeature[0].active,
                    activated_on: betterCodes.includes(
                      PurchasedFeature[0].code_used
                    )
                      ? PurchasedFeature[0].activated_on
                      : feature.isChecked
                      ? new Date()
                      : PurchasedFeature[0].activated_on,
                    title: feature.title,
                  };
                } else {
                  return {
                    id: feature.id,
                    data: {},
                    launches_since_activation: 0,
                    last_used: new Date(),
                    notes: "",
                    title: feature.title,
                    code_used: feature.isChecked ? redeemCode.code : "",
                    active: feature.isChecked,
                    activated_on: feature.isChecked ? new Date() : "",
                  };
                }
              }),
            };
          } else {
            return {
              id: pTa.id,
              activeCount: 0,
              title: pTa.title,
              data: {},
              apps: pTa.apps.map((app) => {
                return {
                  id: app.id,
                  title: app.title,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  code_used: app.isChecked ? redeemCode.code : "",
                  active: app.isChecked,
                  activated_on: app.isChecked ? new Date() : "",
                };
              }),
              features: pTa.features.map((feature) => {
                return {
                  id: feature.id,
                  title: feature.title,
                  data: {},
                  launches_since_activation: 0,
                  last_used: new Date(),
                  notes: "",
                  code_used: feature.isChecked ? redeemCode.code : "",
                  active: feature.isChecked,
                  activated_on: feature.isChecked ? new Date() : "",
                };
              }),
            };
          }
        });
      });

      updatedPurchased = newPurchased.map((e) => {
        return {
          ...e,
          activeCount:
            e.apps.filter((a) => a.active).length +
            e.features.filter((f) => f.active).length,
        };
      });

      await Code.doc(codeData[0].id).update({
        activation: true,
        already_used: false,
      });

      await CodeHistory.doc(activeCodeHistoryData.id).update({
        activation: false,
      });
    }

    await User.doc(userId).update({
      purchased: updatedPurchased,
    });

    let updatedUserDataDoc = await User.doc(userId).get();
    let updatedUserData = {
      ...updatedUserDataDoc.data(),
      id: updatedUserDataDoc.id,
    };

    const codeHistoryAllDataDoc = await CodeHistory.where(
      "special_code",
      "==",
      false
    )
      .where("user_id", "==", userId)
      .get();
    const codeHistoryAllData = codeHistoryAllDataDoc.docs.map((ch) => {
      return {
        id: ch.id,
        ...ch.data(),
      };
    });
    return res.status(200).json({
      data: {
        user: updatedUserData,
        code_history: codeHistoryAllData,
      },
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error,
      success: false,
    });
  }
};

exports.cronJobForExpireCode = async (req, res) => {
  try {
    const now = moment().format("YYYY-MM-DD");
    const codeHistory = await CodeHistory.where("expiry_date", "==", now)
      .where("activation", "==", true)
      .get();
    let codeHistortyData = codeHistory.docs.map((ec) => {
      return {
        id: ec.id,
        ...ec.data(),
      };
    });
    let array = [];

    for (el of codeHistortyData) {
      const userId = el.user_id;
      const user = await User.doc(userId).get();
      const userData = user.data();
      const firstname = userData.firstname;
      const lastname = userData.lastname;
      const email = userData.email;

      const stripePaymentData = await StripePayment.where(
        "user_id",
        "==",
        userId
      )
        .where("auto_subscription", "==", true)
        .get();
      const stripePayment = stripePaymentData.docs.map((es) => {
        return {
          id: es.id,
          ...es.data(),
        };
      })[0];

      if (
        el.code === "Subscription" &&
        stripePayment &&
        stripePayment.auto_subscription
      ) {
        const subscription = await stripe.subscriptions.retrieve(
          stripePayment.subscription_id
        );
        const expiryDate = moment
          .utc(subscription.current_period_end * 1000)
          .format("YYYY-MM-DD");
        if (new Date(el.expiry_date) < new Date(expiryDate)) {
          await CodeHistory.doc(el.id).update({ expiry_date: expiryDate });
        }
      } else {
        array = userData.purchased.map((p) => {
          return {
            ...p,
            apps: p.apps.map((app) => {
              if (app.code_used === el.code) {
                return {
                  ...app,
                  active: false,
                  code_used: "",
                  activated_on: "",
                };
              } else {
                return app;
              }
            }),
            features: p.features.map((feature) => {
              if (feature.code_used === el.code) {
                return {
                  ...feature,
                  active: false,
                  code_used: "",
                  activated_on: "",
                };
              } else {
                return feature;
              }
            }),
          };
        });

        const activeCount = array
          .map((e) => {
            return {
              ...e,
              activeCount:
                e.apps.filter((a) => a.active).length +
                e.features.filter((f) => f.active).length,
            };
          })
          .filter((p) => p.activeCount > 0);

        await CodeHistory.doc(el.id).update({
          activation: false,
        });
        const code = await Code.where("code", "==", el.code).get();
        const codeData = code.docs.map((c) => {
          return {
            id: c.id,
            ...c.data(),
          };
        });
        if (codeData.length > 0) {
          const codeId = codeData[0].id;
          await Code.doc(codeId).update({
            already_used: false,
            activation: true,
          });
        }

        await User.doc(userId).update({ purchased: activeCount });

        if (el.code === "Subscription") {
          await User.doc(userId).update({
            active_subscription: false,
            auto_product_active: false,
            subscription_data: {
              ...userData.subscription_data,
              active: false,
            },
          });
        }
      }
    }
    return res.status(200).json({
      data: "successfully expired subscriptions of today",
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error,
      success: false,
    });
  }
};

exports.crobnJobForExpireCodeSoon = async (req, res) => {
  try {
    const nextFiveDayDate = moment().add(7, "d").format("YYYY-MM-DD");

    const codeHistory = await CodeHistory.where(
      "expiry_date",
      "==",
      nextFiveDayDate
    )
      .where("activation", "==", true)
      .get();

    const codeHistortyData = codeHistory.docs.map((e) => {
      return {
        id: e.id,
        ...e.data(),
      };
    });

    codeHistortyData.forEach(async (e) => {
      if (e.is_email_send === false) {
        const body =
          "<p>Hi, this is just a friendly reminder to let you know that your ThoughtCast Magic Subscription will expire in 7 days. To prevent your apps from deactivating, please visit thoughtcastowners.com and log in, then update your billing information on the Subscriptions page.</p>" +
          "<p>If you have any questions, just hit reply to this email and we'll be happy to help you out!</p>" +
          "<p>Thanks!</p>";
        const userId = e.user_id;
        const user = await User.doc(userId).get();
        if (user.is_deleted === false) {
          const email = user.data().email;
          const message = {
            to: email,
            subject: "You ThoughtCast Subscription will expire in 7 days!",
            html: htmlMail(
              "You ThoughtCast Subscription will expire in 7 days!",
              body
            ),
          };
          sendMail(message);
        }

        await CodeHistory.doc(e.id).update({ is_email_send: true });
      }
    });

    return res.status(200).json({
      data: "successfully sent expired soon email",
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error,
      success: false,
    });
  }
};

exports.cronJobForExtendExpiryAutoPayment = async (req, res) => {
  try {
    const now = moment().subtract(1, "days").format("YYYY-MM-DD");

    const codeHistory = await CodeHistory.where("expiry_date", "==", now)
      .where("activation", "==", true)
      .where("code", "==", "Subscription")
      .get();
    let codeHistortyData = codeHistory.docs.map((ec) => {
      return {
        id: ec.id,
        ...ec.data(),
      };
    });

    codeHistortyData.forEach(async (el) => {
      if (el.code === "Subscription") {
        const stripePaymentData = await StripePayment.where(
          "user_id",
          "==",
          el.user_id
        )
          .where("auto_subscription", "==", true)
          .get();
        const stripePayment = stripePaymentData.docs.map((es) => {
          return {
            id: es.id,
            ...es.data(),
          };
        })[0];

        const subscription = await stripe.subscriptions.retrieve(
          stripePayment.subscription_id
        );
        const expiryDate = moment
          .utc(subscription.current_period_end * 1000)
          .format("YYYY-MM-DD");

        if (new Date(el.expiry_date) < new Date(expiryDate)) {
          await CodeHistory.doc(el.id).update({ expiry_date: expiryDate });
        } else {
          let array = [];
          const userId = el.user_id;
          const user = await User.doc(userId).get();
          const userData = user.data();
          const { firstname, lastname, email } = userData;
          array = userData.purchased.map((p) => {
            return {
              ...p,
              apps: p.apps.map((app) => {
                if (app.code_used === el.code) {
                  return {
                    ...app,
                    active: false,
                    code_used: "",
                    activated_on: "",
                  };
                } else {
                  return app;
                }
              }),
              features: p.features.map((feature) => {
                if (feature.code_used === el.code) {
                  return {
                    ...feature,
                    active: false,
                    code_used: "",
                    activated_on: "",
                  };
                } else {
                  return feature;
                }
              }),
            };
          });

          const activeCount = array
            .map((e) => {
              return {
                ...e,
                activeCount:
                  e.apps.filter((a) => a.active).length +
                  e.features.filter((f) => f.active).length,
              };
            })
            .filter((p) => p.activeCount > 0);

          await CodeHistory.doc(el.id).update({
            activation: false,
          });

          await StripePayment.doc(stripePayment.id).update({
            auto_subscription: false,
            active: false,
          });

          await User.doc(userId).update({
            purchased: activeCount,
            active_subscription: false,
            auto_product_active: false,
            subscription_data: {
              ...userData.subscription_data,
              active: false,
            },
          });
        }
      }
    });

    return res.status(200).json({
      data: "successfully expired subscriptions of today",
      success: true,
    });
  } catch (error) {
    return res.status(400).json({
      error: error,
      success: false,
    });
  }
};
