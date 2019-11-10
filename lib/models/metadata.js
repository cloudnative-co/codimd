'use strict';
var Sequelize = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  const Metadata = sequelize.define('Metadata', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    key: DataTypes.STRING,
    value: DataTypes.STRING
  }, {
    timestamps: false
  });
  Metadata.associate = function(models) {
    // associations can be defined here
    Metadata.belongsTo(models.Note, {
      foreignKey: 'noteId',
      as: 'note',
      constraints: false,
      onDelete: 'CASCADE',
      hooks: true
    })
  };
  return Metadata;
};
